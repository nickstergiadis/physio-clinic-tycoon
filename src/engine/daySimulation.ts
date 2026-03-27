import { PATIENT_ARCHETYPES, ROOM_DEFS, SERVICES, STAFF_TEMPLATES } from '../data/content';
import { DaySummary, GameState, PatientArchetype, PatientVisit, RoomTypeId, ServiceId } from '../types/game';
import { average, clamp, rand, uid } from './utils';
import { applyRandomEvent } from './events';
import { BALANCE, getDifficultyPreset, sumUpgradeEffect } from './simulationConfig';

const getArchetype = (id: string): PatientArchetype => PATIENT_ARCHETYPES.find((p) => p.id === id) ?? PATIENT_ARCHETYPES[0];
const getService = (id: ServiceId) => SERVICES.find((s) => s.id === id) ?? SERVICES[0];
const randomArchetype = (seed: number): PatientArchetype => PATIENT_ARCHETYPES[Math.floor(rand(seed) * PATIENT_ARCHETYPES.length)];
const hasRoom = (state: GameState, roomType: RoomTypeId): boolean => state.rooms.some((room) => room.type === roomType);

export const generatePatients = (state: GameState): PatientVisit[] => {
  const preset = getDifficultyPreset(state.difficultyPreset);
  const baseDemand = Math.max(BALANCE.minDailyDemand, Math.round(state.referrals * BALANCE.referralsToDemand + state.reputation * BALANCE.reputationToDemand));
  const demandMult = (1 + sumUpgradeEffect(state, (effects) => effects.referralMult)) * preset.demandMultiplier;
  const demand = Math.min(BALANCE.maxDailyDemand, Math.round(baseDemand * demandMult));
  const queue: PatientVisit[] = [];

  for (let i = 0; i < demand; i += 1) {
    const seed = state.seed + state.day * 97 + i * 17;
    const archetype = randomArchetype(seed);
    const servicePool = archetype.preferredServices.filter((serviceId) => state.unlockedServices.includes(serviceId));
    const service = servicePool[Math.floor(rand(seed + 3) * servicePool.length)] ?? 'followUp';
    queue.push({
      id: uid(),
      archetype: archetype.id,
      service,
      complexity: archetype.complexity,
      insured: rand(seed + 7) > BALANCE.uninsuredThreshold,
      status: 'waiting'
    });
  }

  return queue;
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
  return Math.max(1, Math.floor((staffCapacity + roomBonus) * overcrowdPenalty));
};

interface VisitResolution {
  revenue: number;
  adminLoad: number;
  totalWait: number;
  noShows: number;
  outcomes: number[];
}

const resolveVisits = (state: GameState, queue: PatientVisit[], capacity: number): VisitResolution => {
  const possible = queue.slice(0, capacity);
  const noShowReduction = sumUpgradeEffect(state, (effects) => effects.noShowReduction);
  const qualityBonus = sumUpgradeEffect(state, (effects) => effects.qualityBonus);
  const premiumBonus = sumUpgradeEffect(state, (effects) => effects.premiumPricing);
  const moraleGain = sumUpgradeEffect(state, (effects) => effects.moraleGain);

  const preset = getDifficultyPreset(state.difficultyPreset);
  const staffPool = state.staff.filter((staffMember) => staffMember.scheduled);
  const hasScheduledStaff = staffPool.length > 0;

  let revenue = 0;
  let adminLoad = 0;
  let totalWait = 0;
  let noShows = 0;
  const outcomes: number[] = [];

  for (let i = 0; i < possible.length; i += 1) {
    const visit = possible[i];
    const archetype = getArchetype(visit.archetype);
    const service = getService(visit.service);

    if (!hasScheduledStaff) {
      noShows += 1;
      continue;
    }

    const staff = staffPool[i % staffPool.length];
    const noShowChance = clamp(archetype.noShowChance - (BALANCE.baseNoShowBuffer + noShowReduction), BALANCE.minNoShowChance, BALANCE.maxNoShowChance);

    if (rand(state.seed + state.day * 31 + i) < noShowChance) {
      noShows += 1;
      continue;
    }

    if (!hasRoom(state, service.requiredRoom)) {
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
    adminLoad += service.adminLoad + archetype.adminBurden;
    totalWait += wait;
    outcomes.push(outcome);

    const fatigueGain = service.fatigueImpact * BALANCE.fatigueServiceScale * (1 - staff.fatigueResistance * BALANCE.fatigueResistanceWeight);
    staff.fatigue = clamp(staff.fatigue + fatigueGain, 0, 100);
    staff.morale = clamp(staff.morale + (satisfaction - 0.6) * 5 + moraleGain * BALANCE.moraleGainScaling, 0, 100);
  }

  return { revenue, adminLoad, totalWait, noShows, outcomes };
};

const settleEconomy = (state: GameState, adminLoad: number) => {
  const adminReduction = sumUpgradeEffect(state, (effects) => effects.adminReduction);
  const preset = getDifficultyPreset(state.difficultyPreset);

  const payroll = state.staff.reduce((sum, staffMember) => sum + staffMember.wage, 0);
  const roomMaintenance = state.rooms.reduce((sum, room) => sum + (ROOM_DEFS.find((def) => def.id === room.type)?.maintenance ?? 0), 0);
  const docs = Math.max(
    0,
    state.backlogDocs + adminLoad * (1 - adminReduction * BALANCE.adminReductionWeight) - state.staff.reduce((sum, staffMember) => sum + staffMember.documentation, 0) * BALANCE.documentationThroughput
  );
  const docsPenalty = docs > BALANCE.docsPenaltyThreshold ? (docs - BALANCE.docsPenaltyThreshold) * BALANCE.docsPenaltyUnit : 0;

  const expenses = (payroll + state.rent + state.equipmentCost + roomMaintenance + docsPenalty) * preset.expenseMultiplier;
  return { payroll, docs, expenses };
};

export const runDay = (state: GameState): GameState => {
  if (state.gameOver || state.gameWon) return state;

  let next: GameState = {
    ...state,
    day: state.day + 1,
    staff: state.staff.map((member) => ({ ...member })),
    rooms: state.rooms.map((room) => ({ ...room })),
    patientQueue: state.patientQueue.map((visit) => ({ ...visit }))
  };

  next = applyRandomEvent(next);

  const queue = generatePatients(next);
  const capacity = treatmentCapacity(next);
  const visits = resolveVisits(next, queue, capacity);

  const treated = Math.max(0, Math.min(capacity, queue.length) - visits.noShows);
  const avgOutcome = average(visits.outcomes);
  const avgWait = treated > 0 ? visits.totalWait / treated : 0;

  const { payroll, docs, expenses } = settleEconomy(next, visits.adminLoad);
  const profit = visits.revenue - expenses;

  const reputationDelta = clamp((avgOutcome - 0.44) * 9 - avgWait * 0.03 - visits.noShows * 0.06 - docs * 0.035, -4, 5);
  const referralsDelta = Math.round(clamp(reputationDelta * 0.75 + treated * 0.03 + 0.4, -2, 5));
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
  next.payrollDue = payroll;
  next.backlogDocs = docs;
  next.fatigueIndex = fatigueIndex;
  next.reputation = clamp(next.reputation + reputationDelta, 0, 100);
  next.referrals = Math.max(0, next.referrals + referralsDelta);
  next.patientQueue = queue;

  if (next.day % 7 === 0) next.week += 1;

  const hasScheduledStaff = next.staff.some((staffMember) => staffMember.scheduled);
  const notes: string[] = [];
  if (avgWait > 18) notes.push('Long waits hurt satisfaction. Consider more treatment capacity.');
  if (docs > 10) notes.push('Documentation backlog is expensive. Add admin staff or EHR upgrades.');
  if (fatigueIndex > 0.65) notes.push('Staff fatigue is high. Schedule fewer services or improve wellness.');
  if (visits.noShows > treated * 0.25) notes.push('No-show rate is high. Online booking can stabilize attendance.');
  if (!hasScheduledStaff) notes.push('No staff were scheduled today, so no patients were treated.');

  const summary: DaySummary = {
    day: next.day,
    revenue: Math.round(visits.revenue),
    expenses: Math.round(expenses),
    profit: Math.round(profit),
    treated,
    noShows: visits.noShows,
    avgOutcome: Number(avgOutcome.toFixed(2)),
    avgWait: Number(avgWait.toFixed(1)),
    notes
  };

  next.latestSummary = summary;
  next.eventLog = [`${next.day}: Treated ${treated}, profit $${summary.profit}, rep ${next.reputation.toFixed(0)}.`, ...next.eventLog].slice(0, 12);

  const bankruptcy = next.cash < -10000;
  const reputationCollapse = next.reputation < 3 && next.day > 10;
  const burnoutCollapse = next.fatigueIndex > 0.94 && next.day > 14;

  next.gameOver = bankruptcy || reputationCollapse || burnoutCollapse;
  next.gameWon =
    next.mode === 'campaign' &&
    next.week >= next.campaignGoal.targetWeek &&
    next.reputation >= next.campaignGoal.targetReputation &&
    next.cash >= next.campaignGoal.targetCash;

  return next;
};
