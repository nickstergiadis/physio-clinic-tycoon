import { PATIENT_ARCHETYPES, ROOM_DEFS, SERVICES, STAFF_TEMPLATES } from '../data/content';
import { DaySummary, GameState, PatientArchetype, PatientVisit, RoomTypeId, ServiceId } from '../types/game';
import { average, clamp, rand, uid } from './utils';
import { applyRandomEvent } from './events';
import { BALANCE, getDifficultyPreset, sumUpgradeEffect } from './simulationConfig';

const getArchetype = (id: string): PatientArchetype => PATIENT_ARCHETYPES.find((p) => p.id === id) ?? PATIENT_ARCHETYPES[0];
const getService = (id: ServiceId) => SERVICES.find((s) => s.id === id) ?? SERVICES[0];
const randomArchetype = (seed: number): PatientArchetype => PATIENT_ARCHETYPES[Math.floor(rand(seed) * PATIENT_ARCHETYPES.length)];
const hasRoom = (state: GameState, roomType: RoomTypeId): boolean => state.rooms.some((room) => room.type === roomType);

const totalWeeklyFixedCosts = (state: GameState): number => {
  const payroll = state.staff.reduce((sum, staffMember) => sum + staffMember.wage, 0) * 7;
  const roomMaintenance = state.rooms.reduce((sum, room) => sum + (ROOM_DEFS.find((def) => def.id === room.type)?.maintenance ?? 0), 0) * 7;
  return payroll + state.rent * 7 + state.equipmentCost * 7 + roomMaintenance;
};

interface DemandBuild {
  leads: number;
  booked: PatientVisit[];
  lostUnbooked: number;
  lostServiceMismatch: number;
}

const buildDailyDemand = (state: GameState): DemandBuild => {
  const preset = getDifficultyPreset(state.difficultyPreset);
  const modifier = state.operationalModifiers;
  const baseDemand = Math.max(BALANCE.minDailyDemand, Math.round(state.referrals * BALANCE.referralsToDemand + state.reputation * BALANCE.reputationToDemand));
  const demandMult = (1 + sumUpgradeEffect(state, (effects) => effects.referralMult)) * preset.demandMultiplier * modifier.leadMultiplier;
  const leads = Math.min(BALANCE.maxDailyDemand + 18, Math.round(baseDemand * demandMult));
  const bookingRate = clamp(
    0.52 + state.reputation * 0.002 + state.staff.reduce((sum, member) => sum + member.communication, 0) / Math.max(1, state.staff.length * 12) + modifier.bookingShift,
    0.4,
    0.93
  );

  const booked: PatientVisit[] = [];
  let lostUnbooked = 0;
  let lostServiceMismatch = 0;

  for (let i = 0; i < leads; i += 1) {
    const seed = state.seed + state.day * 97 + i * 17;
    if (rand(seed + 99) > bookingRate) {
      lostUnbooked += 1;
      continue;
    }

    const archetype = randomArchetype(seed);
    const servicePool = archetype.preferredServices.filter((serviceId) => state.unlockedServices.includes(serviceId));
    const service = servicePool[Math.floor(rand(seed + 3) * servicePool.length)];

    if (!service) {
      lostServiceMismatch += 1;
      continue;
    }

    booked.push({
      id: uid(),
      archetype: archetype.id,
      service,
      complexity: archetype.complexity,
      insured: rand(seed + 7) > BALANCE.uninsuredThreshold,
      status: 'waiting'
    });
  }

  return { leads, booked, lostUnbooked, lostServiceMismatch };
};

const treatmentCapacity = (state: GameState): number => {
  const activeStaff = state.staff.filter((staffMember) => staffMember.scheduled);
  const staffCapacity = activeStaff.reduce(
    (sum, staffMember) => sum + BALANCE.capacityPerStaff * staffMember.speed * (1 - staffMember.fatigue / BALANCE.fatigueCapacityDivisor),
    0
  );
  const roomBonus = state.rooms.reduce((sum, room) => {
    const def = ROOM_DEFS.find((roomDef) => roomDef.id === room.type);
    return sum + (def?.throughputBonus ?? 0) * BALANCE.roomThroughputUnit;
  }, 0);
  const overcrowdPenalty = state.rooms.length < BALANCE.overcrowdThreshold ? BALANCE.overcrowdPenalty : 1;
  return Math.max(0, Math.floor((staffCapacity + roomBonus) * overcrowdPenalty));
};

interface VisitResolution {
  revenue: number;
  variableCosts: number;
  adminLoad: number;
  totalWait: number;
  cancellations: number;
  noShows: number;
  attended: number;
  capacityLost: number;
  outcomes: number[];
}

const resolveVisits = (state: GameState, queue: PatientVisit[], capacity: number): VisitResolution => {
  const processable = queue.slice(0, capacity);
  const capacityLost = Math.max(0, queue.length - capacity);
  const noShowReduction = sumUpgradeEffect(state, (effects) => effects.noShowReduction);
  const qualityBonus = sumUpgradeEffect(state, (effects) => effects.qualityBonus);
  const premiumBonus = sumUpgradeEffect(state, (effects) => effects.premiumPricing);
  const moraleGain = sumUpgradeEffect(state, (effects) => effects.moraleGain);

  const preset = getDifficultyPreset(state.difficultyPreset);
  const staffPool = state.staff.filter((staffMember) => staffMember.scheduled);
  const hasScheduledStaff = staffPool.length > 0;
  const modifier = state.operationalModifiers;

  let revenue = 0;
  let variableCosts = 0;
  let adminLoad = 0;
  let totalWait = 0;
  let cancellations = 0;
  let noShows = 0;
  let attended = 0;
  const outcomes: number[] = [];

  for (let i = 0; i < processable.length; i += 1) {
    const visit = processable[i];
    const archetype = getArchetype(visit.archetype);
    const service = getService(visit.service);

    if (!hasScheduledStaff || !hasRoom(state, service.requiredRoom)) {
      cancellations += 1;
      continue;
    }

    const staff = staffPool[i % staffPool.length];
    const cancellationChance = clamp(0.04 + archetype.complexity * 0.08 + modifier.cancellationShift, 0.01, 0.35);
    if (rand(state.seed + state.day * 41 + i) < cancellationChance) {
      cancellations += 1;
      continue;
    }

    const noShowChance = clamp(archetype.noShowChance - (BALANCE.baseNoShowBuffer + noShowReduction) + modifier.noShowShift, BALANCE.minNoShowChance, BALANCE.maxNoShowChance);
    if (rand(state.seed + state.day * 31 + i) < noShowChance) {
      noShows += 1;
      continue;
    }

    const wait = Math.max(0, (i + 1 - capacity * BALANCE.comfortCapacityRatio) * BALANCE.waitUnitMinutes);
    const specialty = STAFF_TEMPLATES.find((template) => template.id === staff.role)?.specialtyBonus[archetype.id] ?? 0;
    const quality = clamp(staff.quality + service.qualityImpact + qualityBonus + specialty - staff.fatigue / BALANCE.qualityFatigueDivisor, 0.2, 1.3);
    const outcome = clamp((quality * archetype.improvementSpeed + archetype.adherence * 0.25) * (1 - archetype.complexity * 0.35), 0, 1);
    const satisfaction = clamp(0.7 + quality * 0.3 - (wait / 100) * archetype.satisfactionSensitivity, 0, 1.2);

    const payerMultiplier = visit.insured ? BALANCE.insuredRevenueMultiplier : BALANCE.selfPayRevenueMultiplier;
    revenue += service.baseRevenue * (1 + premiumBonus) * payerMultiplier * preset.revenueMultiplier;
    variableCosts += (service.baseRevenue * 0.14 + service.duration * 0.7) * (1 + modifier.variableCostShift);
    adminLoad += service.adminLoad + archetype.adminBurden;
    totalWait += wait;
    outcomes.push(outcome);
    attended += 1;

    const fatigueGain = service.fatigueImpact * BALANCE.fatigueServiceScale * (1 - staff.fatigueResistance * BALANCE.fatigueResistanceWeight);
    staff.fatigue = clamp(staff.fatigue + fatigueGain, 0, 100);
    staff.morale = clamp(staff.morale + (satisfaction - 0.6) * 5 + moraleGain * BALANCE.moraleGainScaling, 0, 100);
  }

  return { revenue, variableCosts, adminLoad, totalWait, cancellations, noShows, attended, capacityLost, outcomes };
};

export const generatePatients = (state: GameState): PatientVisit[] => buildDailyDemand(state).booked;

export const runDay = (state: GameState): GameState => {
  if (state.gameOver || state.gameWon) return state;

  let next: GameState = {
    ...state,
    day: state.day + 1,
    staff: state.staff.map((member) => ({ ...member })),
    rooms: state.rooms.map((room) => ({ ...room })),
    patientQueue: state.patientQueue.map((visit) => ({ ...visit })),
    operationalModifiers: { ...state.operationalModifiers }
  };

  next = applyRandomEvent(next);

  const demand = buildDailyDemand(next);
  const capacity = treatmentCapacity(next);
  const visits = resolveVisits(next, demand.booked, capacity);

  const avgOutcome = average(visits.outcomes);
  const avgWait = visits.attended > 0 ? visits.totalWait / visits.attended : 0;
  const utilization = capacity > 0 ? clamp(visits.attended / capacity, 0, 1.4) : 0;

  const adminReduction = sumUpgradeEffect(next, (effects) => effects.adminReduction);
  const docs = Math.max(
    0,
    next.backlogDocs + visits.adminLoad * (1 - adminReduction * BALANCE.adminReductionWeight) - next.staff.reduce((sum, staffMember) => sum + staffMember.documentation, 0) * BALANCE.documentationThroughput
  );
  const docsPenalty = docs > BALANCE.docsPenaltyThreshold ? (docs - BALANCE.docsPenaltyThreshold) * BALANCE.docsPenaltyUnit : 0;
  const variableCosts = visits.variableCosts + docsPenalty;
  const weeklyFixedCosts = totalWeeklyFixedCosts(next);

  const dayOfWeek = ((next.day - 1) % 7) + 1;
  const weeklyCostsApplied = dayOfWeek === 7 ? weeklyFixedCosts : 0;
  const daysUntilWeeklyCosts = dayOfWeek === 7 ? 7 : 7 - dayOfWeek;

  const preset = getDifficultyPreset(next.difficultyPreset);
  const expenses = (variableCosts + weeklyCostsApplied) * preset.expenseMultiplier;
  const profit = visits.revenue - expenses;

  const updatedLedger = {
    revenue: dayOfWeek === 7 ? 0 : next.weeklyLedger.revenue + visits.revenue,
    variableCosts: dayOfWeek === 7 ? 0 : next.weeklyLedger.variableCosts + variableCosts,
    attendedVisits: dayOfWeek === 7 ? 0 : next.weeklyLedger.attendedVisits + visits.attended,
    noShows: dayOfWeek === 7 ? 0 : next.weeklyLedger.noShows + visits.noShows
  };

  const reputationDelta = clamp(
    (avgOutcome - 0.46) * 8 + utilization * 1.4 - avgWait * 0.025 - visits.noShows * 0.045 - visits.cancellations * 0.04 - docs * 0.025,
    -3,
    4
  );
  const referralsDelta = Math.round(clamp(reputationDelta * 0.55 + visits.attended * 0.045 - visits.capacityLost * 0.025 + 0.35, -2, 5));
  const fatigueIndex = clamp(average(next.staff.map((staffMember) => staffMember.fatigue)) / 100, 0, 1);

  next.staff = next.staff.map((staffMember) => ({
    ...staffMember,
    fatigue: clamp(
      staffMember.fatigue - BALANCE.dailyFatigueRecovery + (1 - staffMember.fatigueResistance) * BALANCE.lowResistanceRecoveryPenalty,
      0,
      100
    )
  }));

  next.cash += profit;
  next.payrollDue = Math.round(weeklyFixedCosts);
  next.backlogDocs = docs;
  next.fatigueIndex = fatigueIndex;
  next.reputation = clamp(next.reputation + reputationDelta, 0, 100);
  next.referrals = Math.max(0, next.referrals + referralsDelta);
  next.patientQueue = demand.booked;
  next.weeklyLedger = updatedLedger;

  if (next.day % 7 === 0) next.week += 1;

  const notes: string[] = [];
  const hasScheduledStaff = next.staff.some((staffMember) => staffMember.scheduled);
  if (visits.capacityLost > 0) notes.push('Demand exceeded daily capacity. Add clinicians or rooms to capture growth.');
  if (demand.lostServiceMismatch > 0) notes.push('Some leads requested services your clinic cannot provide yet.');
  if (visits.cancellations + visits.noShows > visits.attended * 0.45) notes.push('Attendance reliability is poor. Booking/no-show tools can recover demand.');
  if (docs > 12) notes.push('Documentation backlog is adding variable cost drag.');
  if (dayOfWeek >= 5) notes.push(`Weekly liabilities due in ${daysUntilWeeklyCosts} day(s): $${Math.round(weeklyFixedCosts)}.`);
  if (!hasScheduledStaff) notes.push('No staff were scheduled today, so no patients were treated.');
  if (next.operationalModifiers.note) notes.push(next.operationalModifiers.note);

  const summary: DaySummary = {
    day: next.day,
    revenue: Math.round(visits.revenue),
    expenses: Math.round(expenses),
    profit: Math.round(profit),
    fixedCosts: Math.round(weeklyCostsApplied),
    variableCosts: Math.round(variableCosts),
    daysUntilWeeklyCosts,
    weeklyCostsDueNext: Math.round(weeklyFixedCosts),
    inboundLeads: demand.leads,
    bookedVisits: demand.booked.length,
    attendedVisits: visits.attended,
    utilization: Number((utilization * 100).toFixed(1)),
    lostDemand: {
      unbooked: demand.lostUnbooked,
      serviceMismatch: demand.lostServiceMismatch,
      capacity: visits.capacityLost,
      cancellations: visits.cancellations,
      noShows: visits.noShows
    },
    treated: visits.attended,
    noShows: visits.noShows,
    avgOutcome: Number(avgOutcome.toFixed(2)),
    avgWait: Number(avgWait.toFixed(1)),
    notes
  };

  next.latestSummary = summary;
  next.demandSnapshot = {
    inboundLeads: demand.leads,
    bookedVisits: demand.booked.length,
    utilization: summary.utilization,
    lostDemand: summary.lostDemand
  };
  next.eventLog = [
    `${next.day}: Leads ${summary.inboundLeads} → booked ${summary.bookedVisits} → attended ${summary.attendedVisits}. Profit $${summary.profit}.`,
    ...next.eventLog
  ].slice(0, 12);

  const bankruptcy = next.cash < -25000 && next.day > 14;
  const reputationCollapse = next.reputation < 2 && next.day > 20;
  const burnoutCollapse = next.fatigueIndex > 0.96 && next.day > 20;

  next.gameOver = bankruptcy || reputationCollapse || burnoutCollapse;
  next.gameWon =
    next.mode === 'campaign' &&
    next.week >= next.campaignGoal.targetWeek &&
    next.reputation >= next.campaignGoal.targetReputation &&
    next.cash >= next.campaignGoal.targetCash;

  next.operationalModifiers = {
    leadMultiplier: 1,
    bookingShift: 0,
    cancellationShift: 0,
    noShowShift: 0,
    variableCostShift: 0
  };

  return next;
};
