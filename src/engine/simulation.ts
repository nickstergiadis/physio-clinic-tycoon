import { PATIENT_ARCHETYPES, ROOM_DEFS, SERVICES, STAFF_TEMPLATES, UPGRADES } from '../data/content';
import { DaySummary, EventCard, GameState, PatientArchetype, PatientVisit, RoomTypeId, ServiceId, StaffRoleId } from '../types/game';
import { average, clamp, rand, uid } from './utils';

const getArchetype = (id: string): PatientArchetype => PATIENT_ARCHETYPES.find((p) => p.id === id) ?? PATIENT_ARCHETYPES[0];
const getService = (id: ServiceId) => SERVICES.find((s) => s.id === id) ?? SERVICES[0];

const randomArchetype = (seed: number): PatientArchetype => PATIENT_ARCHETYPES[Math.floor(rand(seed) * PATIENT_ARCHETYPES.length)];

const hasRoom = (state: GameState, roomType: RoomTypeId): boolean => state.rooms.some((r) => r.type === roomType);

const unlockedUpgradeEffects = (state: GameState) => UPGRADES.filter((u) => state.unlockedUpgrades.includes(u.id)).map((u) => u.effects);

const sumEffect = (state: GameState, selector: (effects: (typeof UPGRADES)[number]['effects']) => number | undefined): number =>
  unlockedUpgradeEffects(state).reduce((sum, e) => sum + (selector(e) ?? 0), 0);

const EVENT_CARDS: EventCard[] = [
  { id: 'mva_batch', name: 'MVA Referral Batch', description: 'Insurer-heavy referrals arrived.', chance: 0.08, apply: (s) => ({ ...s, referrals: s.referrals + 4, backlogDocs: s.backlogDocs + 2, eventLog: [`${s.day}: MVA referrals increased admin load.`, ...s.eventLog].slice(0, 12) }) },
  { id: 'flu_wave', name: 'Seasonal Flu Wave', description: 'More no-shows this day.', chance: 0.08, apply: (s) => ({ ...s, eventLog: [`${s.day}: Seasonal illness increased no-show risk.`, ...s.eventLog].slice(0, 12), reputation: clamp(s.reputation - 1, 0, 100) }) },
  { id: 'sports_tournament', name: 'Local Sports Tournament', description: 'Higher athlete demand.', chance: 0.06, apply: (s) => ({ ...s, referrals: s.referrals + 3, reputation: clamp(s.reputation + 1, 0, 100), eventLog: [`${s.day}: Athlete referrals surged.`, ...s.eventLog].slice(0, 12) }) },
  { id: 'ehr_outage', name: 'EHR Outage', description: 'Documentation is delayed.', chance: 0.05, apply: (s) => ({ ...s, backlogDocs: s.backlogDocs + 5, eventLog: [`${s.day}: EHR outage caused a backlog.`, ...s.eventLog].slice(0, 12) }) },
  { id: 'staff_conflict', name: 'Staff Conflict', description: 'Morale drop for the team.', chance: 0.05, apply: (s) => ({ ...s, staff: s.staff.map((m) => ({ ...m, morale: clamp(m.morale - 5, 0, 100) })), eventLog: [`${s.day}: Team morale dipped after conflict.`, ...s.eventLog].slice(0, 12) }) },
  { id: 'equipment_break', name: 'Equipment Breakdown', description: 'Maintenance costs increase.', chance: 0.07, apply: (s) => ({ ...s, equipmentCost: s.equipmentCost + 50, eventLog: [`${s.day}: Equipment breakdown increased costs.`, ...s.eventLog].slice(0, 12) }) },
  { id: 'positive_reviews', name: 'Positive Review Streak', description: 'Boost in referrals and reputation.', chance: 0.09, apply: (s) => ({ ...s, referrals: s.referrals + 2, reputation: clamp(s.reputation + 3, 0, 100), eventLog: [`${s.day}: Great reviews boosted reputation.`, ...s.eventLog].slice(0, 12) }) },
  { id: 'insurer_audit', name: 'Insurer Audit', description: 'Administrative pressure rises.', chance: 0.04, apply: (s) => ({ ...s, backlogDocs: s.backlogDocs + 6, cash: s.cash - 300, eventLog: [`${s.day}: Insurer audit consumed admin time.`, ...s.eventLog].slice(0, 12) }) },
  { id: 'community_fair', name: 'Community Health Fair', description: 'New leads and branding.', chance: 0.08, apply: (s) => ({ ...s, referrals: s.referrals + 3, reputation: clamp(s.reputation + 2, 0, 100), cash: s.cash - 250, eventLog: [`${s.day}: Health fair generated new leads.`, ...s.eventLog].slice(0, 12) }) },
  { id: 'staff_training_day', name: 'Staff Training Day', description: 'Quality up, capacity down briefly.', chance: 0.07, apply: (s) => ({ ...s, staff: s.staff.map((m) => ({ ...m, quality: clamp(m.quality + 0.01, 0, 1), fatigue: clamp(m.fatigue + 3, 0, 100) })), eventLog: [`${s.day}: Training improved care quality.`, ...s.eventLog].slice(0, 12) }) },
  { id: 'rent_review', name: 'Rent Review', description: 'Rent increases slightly.', chance: 0.04, apply: (s) => ({ ...s, rent: s.rent + 30, eventLog: [`${s.day}: Rent increased after review.`, ...s.eventLog].slice(0, 12) }) }
];

export const generatePatients = (state: GameState): PatientVisit[] => {
  const baseDemand = Math.max(4, Math.round(state.referrals * 0.75 + state.reputation * 0.09));
  const demandMult = 1 + sumEffect(state, (e) => e.referralMult);
  const demand = Math.min(40, Math.round(baseDemand * demandMult));
  const queue: PatientVisit[] = [];

  for (let i = 0; i < demand; i += 1) {
    const seed = state.seed + state.day * 97 + i * 17;
    const archetype = randomArchetype(seed);
    const servicePool = archetype.preferredServices.filter((s) => state.unlockedServices.includes(s));
    const service = servicePool[Math.floor(rand(seed + 3) * servicePool.length)] ?? 'followUp';
    queue.push({
      id: uid(),
      archetype: archetype.id,
      service,
      complexity: archetype.complexity,
      insured: rand(seed + 7) > 0.35,
      status: 'waiting'
    });
  }
  return queue;
};

const treatmentCapacity = (state: GameState): number => {
  const activeStaff = state.staff.filter((s) => s.scheduled);
  const staffCapacity = activeStaff.reduce((sum, s) => sum + 5 * s.speed * (1 - s.fatigue / 180), 0);
  const roomBonus = state.rooms.reduce((sum, r) => {
    const def = ROOM_DEFS.find((d) => d.id === r.type);
    return sum + (def?.throughputBonus ?? 0) * 6;
  }, 0);
  const overcrowdPenalty = state.rooms.length < 4 ? 0.8 : 1;
  return Math.max(1, Math.floor((staffCapacity + roomBonus) * overcrowdPenalty));
};

export const runDay = (state: GameState): GameState => {
  if (state.gameOver || state.gameWon) return state;

  let next: GameState = { ...state, day: state.day + 1 };

  const eventRoll = rand(next.seed + next.day * 13);
  const selectedEvent = EVENT_CARDS.find((_, idx) => eventRoll < EVENT_CARDS.slice(0, idx + 1).reduce((sum, e) => sum + e.chance, 0));
  if (selectedEvent) {
    next = selectedEvent.apply(next);
  }

  const queue = generatePatients(next);
  const capacity = treatmentCapacity(next);
  const possible = queue.slice(0, capacity);
  const noShowReduction = sumEffect(next, (e) => e.noShowReduction);
  const adminReduction = sumEffect(next, (e) => e.adminReduction);
  const qualityBonus = sumEffect(next, (e) => e.qualityBonus);
  const premiumBonus = sumEffect(next, (e) => e.premiumPricing);
  const moraleGain = sumEffect(next, (e) => e.moraleGain);

  let revenue = 0;
  let adminLoad = 0;
  let totalWait = 0;
  let noShows = 0;
  const outcomes: number[] = [];

  const staffPool = next.staff.filter((s) => s.scheduled);
  const hasScheduledStaff = staffPool.length > 0;

  for (let i = 0; i < possible.length; i += 1) {
    const visit = possible[i];
    const archetype = getArchetype(visit.archetype);
    const service = getService(visit.service);
    if (!hasScheduledStaff) {
      noShows += 1;
      continue;
    }

    const staff = staffPool[i % staffPool.length];

    const noShowChance = clamp(archetype.noShowChance - noShowReduction, 0.02, 0.5);
    if (rand(next.seed + next.day * 31 + i) < noShowChance) {
      noShows += 1;
      continue;
    }

    if (!hasRoom(next, service.requiredRoom)) {
      noShows += 1;
      continue;
    }

    const wait = Math.max(0, (i + 1 - capacity * 0.6) * 4);
    const specialty = STAFF_TEMPLATES.find((t) => t.id === staff.role)?.specialtyBonus[archetype.id] ?? 0;
    const quality = clamp(staff.quality + service.qualityImpact + qualityBonus + specialty - staff.fatigue / 220, 0.2, 1.3);
    const outcome = clamp((quality * archetype.improvementSpeed + archetype.adherence * 0.25) * (1 - archetype.complexity * 0.35), 0, 1);
    const satisfaction = clamp(0.7 + quality * 0.3 - (wait / 100) * archetype.satisfactionSensitivity, 0, 1.2);

    revenue += service.baseRevenue * (1 + premiumBonus) * (visit.insured ? 0.92 : 1.12);
    adminLoad += service.adminLoad + archetype.adminBurden;
    totalWait += wait;
    outcomes.push(outcome);

    const fatigueGain = service.fatigueImpact * 20 * (1 - staff.fatigueResistance * 0.5);
    staff.fatigue = clamp(staff.fatigue + fatigueGain, 0, 100);
    staff.morale = clamp(staff.morale + (satisfaction - 0.6) * 5 + moraleGain * 0.05, 0, 100);
  }

  const treated = possible.length - noShows;
  const avgOutcome = average(outcomes);
  const avgWait = treated > 0 ? totalWait / treated : 0;

  const payroll = next.staff.reduce((sum, s) => sum + s.wage, 0);
  const roomMaintenance = next.rooms.reduce((sum, r) => sum + (ROOM_DEFS.find((d) => d.id === r.type)?.maintenance ?? 0), 0);
  const docs = Math.max(0, next.backlogDocs + adminLoad * (1 - adminReduction) - next.staff.reduce((sum, s) => sum + s.documentation, 0) * 2.4);
  const docsPenalty = docs > 8 ? (docs - 8) * 22 : 0;

  const expenses = payroll + next.rent + next.equipmentCost + roomMaintenance + docsPenalty;
  const profit = revenue - expenses;

  const reputationDelta = clamp((avgOutcome - 0.45) * 10 - avgWait * 0.04 - noShows * 0.08 - docs * 0.05, -5, 6);
  const referralsDelta = Math.round(clamp(reputationDelta * 0.8 + treated * 0.02, -2, 5));

  const fatigueIndex = clamp(average(next.staff.map((s) => s.fatigue)) / 100, 0, 1);

  next.staff = next.staff.map((s) => ({ ...s, fatigue: clamp(s.fatigue - 8 + (1 - s.fatigueResistance) * 2, 0, 100) }));
  next.cash += profit;
  next.payrollDue = payroll;
  next.backlogDocs = docs;
  next.fatigueIndex = fatigueIndex;
  next.reputation = clamp(next.reputation + reputationDelta, 0, 100);
  next.referrals = Math.max(0, next.referrals + referralsDelta);
  next.patientQueue = queue;

  if (next.day % 7 === 0) {
    next.week += 1;
  }

  const notes: string[] = [];
  if (avgWait > 18) notes.push('Long waits hurt satisfaction. Consider more treatment capacity.');
  if (docs > 10) notes.push('Documentation backlog is expensive. Add admin staff or EHR upgrades.');
  if (fatigueIndex > 0.65) notes.push('Staff fatigue is high. Schedule fewer services or improve wellness.');
  if (noShows > treated * 0.25) notes.push('No-show rate is high. Online booking can stabilize attendance.');
  if (!hasScheduledStaff) notes.push('No staff were scheduled today, so no patients were treated.');

  const summary: DaySummary = {
    day: next.day,
    revenue: Math.round(revenue),
    expenses: Math.round(expenses),
    profit: Math.round(profit),
    treated,
    noShows,
    avgOutcome: Number(avgOutcome.toFixed(2)),
    avgWait: Number(avgWait.toFixed(1)),
    notes
  };

  next.latestSummary = summary;
  next.eventLog = [
    `${next.day}: Treated ${treated}, profit $${summary.profit}, rep ${next.reputation.toFixed(0)}.`,
    ...next.eventLog
  ].slice(0, 12);

  const bankruptcy = next.cash < -5000;
  const reputationCollapse = next.reputation < 5 && next.day > 5;
  const burnoutCollapse = next.fatigueIndex > 0.9 && next.day > 10;

  next.gameOver = bankruptcy || reputationCollapse || burnoutCollapse;
  next.gameWon =
    next.mode === 'campaign' &&
    next.week >= next.campaignGoal.targetWeek &&
    next.reputation >= next.campaignGoal.targetReputation &&
    next.cash >= next.campaignGoal.targetCash;

  return next;
};

export const hireStaff = (state: GameState, role: StaffRoleId): GameState => {
  const template = STAFF_TEMPLATES.find((t) => t.id === role);
  if (!template || state.cash < template.hireCost) return state;

  const newMember = {
    uid: uid(),
    role,
    name: `${template.name} ${Math.floor(Math.random() * 90 + 10)}`,
    speed: template.speed,
    quality: template.quality,
    documentation: template.documentation,
    communication: template.communication,
    fatigueResistance: template.fatigueResistance,
    wage: template.baseWage,
    morale: 70,
    fatigue: 10,
    scheduled: true
  };

  return {
    ...state,
    cash: state.cash - template.hireCost,
    staff: [...state.staff, newMember],
    eventLog: [`Hired ${template.name}.`, ...state.eventLog].slice(0, 12)
  };
};

export const fireStaff = (state: GameState, uidToRemove: string): GameState => {
  if (state.staff.length <= 1) return state;
  return { ...state, staff: state.staff.filter((s) => s.uid !== uidToRemove) };
};

export const toggleStaffSchedule = (state: GameState, staffId: string): GameState => ({
  ...state,
  staff: state.staff.map((s) => (s.uid === staffId ? { ...s, scheduled: !s.scheduled } : s))
});

export const buyUpgrade = (state: GameState, upgradeId: string): GameState => {
  const upgrade = UPGRADES.find((u) => u.id === upgradeId);
  if (!upgrade || state.unlockedUpgrades.includes(upgradeId) || state.cash < upgrade.cost) return state;

  let next: GameState = {
    ...state,
    cash: state.cash - upgrade.cost,
    unlockedUpgrades: [...state.unlockedUpgrades, upgradeId],
    eventLog: [`Purchased upgrade: ${upgrade.name}.`, ...state.eventLog].slice(0, 12)
  };

  if (upgrade.effects.maxClinicSize) next.maxClinicSize = Math.max(next.maxClinicSize, upgrade.effects.maxClinicSize);
  if (upgrade.effects.unlockRooms) next.unlockedRooms = [...new Set([...next.unlockedRooms, ...upgrade.effects.unlockRooms])];
  if (upgrade.effects.unlockServices) next.unlockedServices = [...new Set([...next.unlockedServices, ...upgrade.effects.unlockServices])];

  return next;
};

export const placeRoom = (state: GameState, roomType: RoomTypeId, x: number, y: number): GameState => {
  const def = ROOM_DEFS.find((d) => d.id === roomType);
  if (!def || !state.unlockedRooms.includes(roomType) || state.rooms.length >= state.maxClinicSize) return state;
  if (state.rooms.some((r) => r.x === x && r.y === y)) return state;
  if (state.cash < def.cost) return state;
  if (def.requiredUpgrade && !state.unlockedUpgrades.includes(def.requiredUpgrade)) return state;

  return {
    ...state,
    cash: state.cash - def.cost,
    rooms: [...state.rooms, { id: uid(), type: roomType, level: 1, x, y }],
    clinicSize: state.clinicSize + 1
  };
};

export const removeRoom = (state: GameState, roomId: string): GameState => {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room || ['reception', 'waiting', 'treatment', 'gym'].includes(room.type) && state.rooms.filter((r) => r.type === room.type).length <= 1) return state;
  return { ...state, rooms: state.rooms.filter((r) => r.id !== roomId), clinicSize: Math.max(1, state.clinicSize - 1) };
};
