import { PATIENT_ARCHETYPES, ROOM_DEFS, SERVICES, STAFF_TEMPLATES } from '../data/content';
import { DaySummary, GameState, PatientArchetype, PatientVisit, RoomTypeId, ServiceId, StaffMember } from '../types/game';
import { average, clamp, rand, uid } from './utils';
import { applyRandomEvent } from './events';
import { BALANCE, getDifficultyPreset, sumUpgradeEffect } from './simulationConfig';
import { applyReputationTiers, evaluateObjectives, getScenario, isScenarioFailed, isScenarioWon } from './campaign';

const getArchetype = (id: string): PatientArchetype => PATIENT_ARCHETYPES.find((p) => p.id === id) ?? PATIENT_ARCHETYPES[0];
const getService = (id: ServiceId) => SERVICES.find((s) => s.id === id) ?? SERVICES[0];
const randomArchetype = (seed: number): PatientArchetype => PATIENT_ARCHETYPES[Math.floor(rand(seed) * PATIENT_ARCHETYPES.length)];
const weightedArchetype = (seed: number, state: GameState): PatientArchetype => {
  const scenario = getScenario(state.scenarioId);
  const withWeight = PATIENT_ARCHETYPES.map((archetype) => ({
    archetype,
    weight: 1 + (scenario.demandMixBias[archetype.id] ?? 0)
  }));
  const total = withWeight.reduce((sum, item) => sum + item.weight, 0);
  let roll = rand(seed) * total;
  for (const item of withWeight) {
    roll -= item.weight;
    if (roll <= 0) return item.archetype;
  }
  return randomArchetype(seed);
};
const hasRoom = (state: GameState, roomType: RoomTypeId): boolean => state.rooms.some((room) => room.type === roomType);
const shiftCapacityFactor = (shift: StaffMember['shift']): number => (shift === 'full' ? 1 : shift === 'half' ? 0.62 : 0);

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

    const archetype = weightedArchetype(seed, state);
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
    (sum, staffMember) =>
      sum +
      BALANCE.capacityPerStaff *
        shiftCapacityFactor(staffMember.shift) *
        staffMember.speed *
        (1 - staffMember.fatigue / BALANCE.fatigueCapacityDivisor) *
        (1 - staffMember.burnoutRisk * 0.18),
    0
  );
  const roomBonus = state.rooms.reduce((sum, room) => {
    const def = ROOM_DEFS.find((roomDef) => roomDef.id === room.type);
    return sum + (def?.throughputBonus ?? 0) * BALANCE.roomThroughputUnit * (1 + (room.equipmentLevel - 1) * 0.08);
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
  staffingBottlenecks: number;
  roomBottlenecks: number;
  equipmentBottlenecks: number;
  burnoutPressure: number;
}

const staffServiceFit = (staff: StaffMember, archetype: PatientArchetype, serviceId: ServiceId, requiredRoom: RoomTypeId): number => {
  const roleSpecialty = STAFF_TEMPLATES.find((template) => template.id === staff.role)?.specialtyBonus[archetype.id] ?? 0;
  const focusBonus = staff.specialtyFocus === archetype.id ? 0.08 : 0;
  const certBonus = staff.certifications.includes(serviceId) ? 0.06 : 0;
  const roomFit = staff.assignedRoom === 'flex' || staff.assignedRoom === requiredRoom ? 0.04 : -0.05;
  const fatiguePenalty = staff.fatigue > 75 ? -0.06 : 0;
  return roleSpecialty + focusBonus + certBonus + roomFit + fatiguePenalty;
};

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
  let staffingBottlenecks = 0;
  let roomBottlenecks = 0;
  let equipmentBottlenecks = 0;
  let burnoutPressure = 0;

  for (let i = 0; i < processable.length; i += 1) {
    const visit = processable[i];
    const archetype = getArchetype(visit.archetype);
    const service = getService(visit.service);

    if (!hasScheduledStaff) {
      staffingBottlenecks += 1;
      cancellations += 1;
      continue;
    }
    const serviceRooms = state.rooms.filter((room) => room.type === service.requiredRoom);
    if (serviceRooms.length === 0 || !hasRoom(state, service.requiredRoom)) {
      roomBottlenecks += 1;
      cancellations += 1;
      continue;
    }
    const eligibleStaff = staffPool.filter((staff) => staff.assignedRoom === 'flex' || staff.assignedRoom === service.requiredRoom);
    if (eligibleStaff.length === 0) {
      staffingBottlenecks += 1;
      cancellations += 1;
      continue;
    }
    const staff = [...eligibleStaff].sort((a, b) => staffServiceFit(b, archetype, service.id, service.requiredRoom) - staffServiceFit(a, archetype, service.id, service.requiredRoom))[0];
    const cancellationChance = clamp(0.04 + archetype.complexity * 0.08 + modifier.cancellationShift + preset.cancellationShift, 0.01, 0.35);
    if (rand(state.seed + state.day * 41 + i) < cancellationChance) {
      cancellations += 1;
      continue;
    }

    const noShowChance = clamp(
      archetype.noShowChance - (BALANCE.baseNoShowBuffer + noShowReduction) + modifier.noShowShift + preset.noShowShift,
      BALANCE.minNoShowChance,
      BALANCE.maxNoShowChance
    );
    if (rand(state.seed + state.day * 31 + i) < noShowChance) {
      noShows += 1;
      continue;
    }

    const wait = Math.max(0, (i + 1 - capacity * BALANCE.comfortCapacityRatio) * BALANCE.waitUnitMinutes);
    const matchingFocusedRoom = serviceRooms.filter((room) => room.focusService === service.id).length;
    const avgEquipment = average(serviceRooms.map((room) => room.equipmentLevel));
    const facilityFit = (avgEquipment - 1) * 0.08 * service.equipmentSensitivity + (matchingFocusedRoom / serviceRooms.length) * 0.06 * service.facilitySensitivity;
    if (service.equipmentSensitivity > 0.35 && avgEquipment < 1.6) equipmentBottlenecks += 1;
    const specialty = staffServiceFit(staff, archetype, service.id, service.requiredRoom);
    const burnoutPenalty = staff.burnoutRisk * 0.08;
    const quality = clamp(staff.quality + service.qualityImpact + qualityBonus + specialty + facilityFit - burnoutPenalty - staff.fatigue / BALANCE.qualityFatigueDivisor, 0.2, 1.3);
    const outcome = clamp((quality * archetype.improvementSpeed + archetype.adherence * 0.25) * (1 - archetype.complexity * 0.35), 0, 1);
    const satisfaction = clamp(0.7 + quality * 0.3 - (wait / 100) * archetype.satisfactionSensitivity, 0, 1.2);

    const payerMultiplier = visit.insured ? BALANCE.insuredRevenueMultiplier : BALANCE.selfPayRevenueMultiplier;
    revenue += service.baseRevenue * (1 + premiumBonus + facilityFit * 0.3) * payerMultiplier * preset.revenueMultiplier;
    variableCosts += (service.baseRevenue * 0.14 + service.duration * 0.7) * (1 + modifier.variableCostShift);
    adminLoad += service.adminLoad + archetype.adminBurden;
    totalWait += wait;
    outcomes.push(outcome);
    attended += 1;

    const fatigueGain = service.fatigueImpact * BALANCE.fatigueServiceScale * (1 - staff.fatigueResistance * BALANCE.fatigueResistanceWeight);
    staff.fatigue = clamp(staff.fatigue + fatigueGain, 0, 100);
    staff.morale = clamp(staff.morale + (satisfaction - 0.6) * 5 + moraleGain * BALANCE.moraleGainScaling, 0, 100);
    burnoutPressure += staff.fatigue > 70 ? 1 : 0;
  }

  return { revenue, variableCosts, adminLoad, totalWait, cancellations, noShows, attended, capacityLost, outcomes, staffingBottlenecks, roomBottlenecks, equipmentBottlenecks, burnoutPressure };
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
  const notes: string[] = [];

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
  ) - preset.reputationDecay;
  const referralSaturationPenalty = Math.max(0, (next.referrals - 28) * 0.08);
  const referralsDelta = Math.round(
    clamp(reputationDelta * 0.48 + visits.attended * 0.038 - visits.capacityLost * 0.03 + 0.22 - referralSaturationPenalty, -2, 3)
  );
  const fatigueIndex = clamp(average(next.staff.map((staffMember) => staffMember.fatigue)) / 100, 0, 1);

  next.staff = next.staff.map((staffMember) => ({
    ...staffMember,
    xp: staffMember.xp + (staffMember.scheduled && staffMember.trainingDaysRemaining === 0 ? 7 : 0),
    level: Math.min(5, Math.floor((staffMember.xp + (staffMember.scheduled ? 7 : 0)) / 120) + 1),
    trainingDaysRemaining: Math.max(0, staffMember.trainingDaysRemaining - 1),
    scheduled: staffMember.trainingDaysRemaining > 0 ? false : staffMember.scheduled,
    shift: staffMember.trainingDaysRemaining > 0 ? 'off' : staffMember.shift,
    fatigue: clamp(
      staffMember.fatigue - BALANCE.dailyFatigueRecovery + (1 - staffMember.fatigueResistance) * BALANCE.lowResistanceRecoveryPenalty + (staffMember.shift === 'full' ? 1.4 : 0),
      0,
      100
    ),
    morale: clamp(staffMember.morale + (staffMember.shift === 'off' ? 2.2 : 0) - (staffMember.fatigue > 78 ? 1.5 : 0), 0, 100),
    burnoutRisk: clamp(
      staffMember.burnoutRisk + (staffMember.fatigue > 80 ? 0.03 : -0.015) + (staffMember.shift === 'off' ? -0.02 : 0),
      0,
      1
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
  next.lifetimeStats = {
    attendedVisits: next.lifetimeStats.attendedVisits + visits.attended,
    avgOutcomeRolling:
      next.lifetimeStats.attendedVisits + visits.attended > 0
        ? (next.lifetimeStats.avgOutcomeRolling * next.lifetimeStats.attendedVisits + avgOutcome * visits.attended) /
          (next.lifetimeStats.attendedVisits + visits.attended)
        : next.lifetimeStats.avgOutcomeRolling
  };

  if (next.day % 7 === 0) next.week += 1;

  if (dayOfWeek === 7 && next.loan) {
    const scheduledPayment = next.loan.weeklyPayment;
    const interestDue = next.loan.principal * next.loan.interestRate;
    const payment = Math.min(next.cash + Math.max(0, next.loan.principal), scheduledPayment);
    next.cash -= payment;
    const principalPaid = Math.max(0, payment - interestDue);
    const principalRemaining = Math.max(0, next.loan.principal - principalPaid);
    next.loan = principalRemaining <= 0 || next.loan.weeksRemaining <= 1 ? null : { ...next.loan, principal: principalRemaining, weeksRemaining: next.loan.weeksRemaining - 1 };
    notes.push(`Loan payment processed: $${Math.round(payment)} (${Math.round(principalPaid)} principal).`);
    if (payment < scheduledPayment) {
      next.reputation = clamp(next.reputation - 1.2, 0, 100);
      notes.push('Underpaid financing installment harmed lender confidence.');
    }
  }
  const hasScheduledStaff = next.staff.some((staffMember) => staffMember.scheduled);
  if (visits.capacityLost > 0) notes.push('Demand exceeded daily capacity. Add clinicians or rooms to capture growth.');
  if (visits.staffingBottlenecks > 0) notes.push(`Staffing bottleneck hit ${visits.staffingBottlenecks} visits. Reassign staff or add training coverage.`);
  if (visits.roomBottlenecks > 0) notes.push(`Room bottleneck hit ${visits.roomBottlenecks} visits. Build required room types for service mix.`);
  if (visits.equipmentBottlenecks > 0) notes.push(`Equipment quality constrained ${visits.equipmentBottlenecks} visits. Upgrade key room equipment.`);
  if (demand.lostServiceMismatch > 0) notes.push('Some leads requested services your clinic cannot provide yet.');
  if (visits.cancellations + visits.noShows > visits.attended * 0.45) notes.push('Attendance reliability is poor. Booking/no-show tools can recover demand.');
  if (docs > 12) notes.push('Documentation backlog is adding variable cost drag.');
  if (dayOfWeek >= 5) notes.push(`Weekly liabilities due in ${daysUntilWeeklyCosts} day(s): $${Math.round(weeklyFixedCosts)}.`);
  if (!hasScheduledStaff) notes.push('No staff were scheduled today, so no patients were treated.');
  if (average(next.staff.map((staffMember) => staffMember.burnoutRisk)) > 0.5) notes.push('Burnout risk is rising. Use half/off shifts and stagger training to recover morale.');
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
    bottlenecks: {
      staffing: visits.staffingBottlenecks,
      room: visits.roomBottlenecks,
      equipment: visits.equipmentBottlenecks,
      burnout: visits.burnoutPressure
    },
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

  const scenario = getScenario(next.scenarioId);
  const bankruptcy = next.cash < scenario.failure.maxDebt && next.day > 14;
  const reputationCollapse = next.reputation < 2 && next.day > 20;
  const burnoutCollapse = next.fatigueIndex > 0.96 && next.day > 20;

  next = applyReputationTiers(next);
  next = evaluateObjectives(next);

  const mandatoryObjectivesMet = isScenarioWon(next);
  const deadlineReached = next.week >= next.campaignGoal.targetWeek;
  const objectiveDeadlineFail = deadlineReached && !mandatoryObjectivesMet && next.mode === 'campaign';

  next.gameOver = bankruptcy || reputationCollapse || burnoutCollapse || isScenarioFailed(next) || objectiveDeadlineFail;
  next.gameWon = next.mode === 'campaign' && mandatoryObjectivesMet && deadlineReached;

  next.operationalModifiers = {
    leadMultiplier: 1,
    bookingShift: 0,
    cancellationShift: 0,
    noShowShift: 0,
    variableCostShift: 0
  };

  return next;
};
