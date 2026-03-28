import { PATIENT_ARCHETYPES, ROOM_DEFS, SERVICES, STAFF_TEMPLATES, UPGRADES } from '../data/content';
import { BookingPolicy, BuildItemId, GameState, RoomTypeId, ServiceId, StaffMember, StaffRoleId, StaffTraitId } from '../types/game';
import { uid } from './utils';
import { generatePatients, runDay } from './daySimulation';
import { getDifficultyPreset } from './simulationConfig';
import { getBuildItemDef, getBuildItemPlacementError } from './buildItems';
import { applyIncidentDecision } from './events';

export { generatePatients, runDay };
const STAFF_TRAITS: StaffTraitId[] = ['steady', 'empathetic', 'fastLearner', 'resilient', 'specialistMindset'];
const randomPick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

export const hireStaff = (state: GameState, role: StaffRoleId): GameState => {
  const template = STAFF_TEMPLATES.find((t) => t.id === role);
  if (!template || state.cash < template.hireCost) return state;
  const trait = randomPick(STAFF_TRAITS);
  const specialtyFocus = randomPick(PATIENT_ARCHETYPES.map((p) => p.id));
  const traitEffects: Record<StaffTraitId, { speed: number; quality: number; docs: number; fatigueResistance: number }> = {
    steady: { speed: 0, quality: 0.04, docs: 0.04, fatigueResistance: 0.03 },
    empathetic: { speed: -0.02, quality: 0.05, docs: 0, fatigueResistance: 0.01 },
    fastLearner: { speed: 0.03, quality: 0.01, docs: 0.01, fatigueResistance: 0 },
    resilient: { speed: 0, quality: 0.01, docs: 0, fatigueResistance: 0.07 },
    specialistMindset: { speed: -0.01, quality: 0.06, docs: -0.02, fatigueResistance: -0.01 }
  };
  const effect = traitEffects[trait];

  const newMember: StaffMember = {
    uid: uid(),
    role,
    name: `${template.name} ${Math.floor(Math.random() * 90 + 10)}`,
    trait,
    specialtyFocus,
    assignedRoom: role === 'frontDesk' ? 'reception' : 'flex',
    speed: template.speed + effect.speed,
    quality: template.quality + effect.quality,
    documentation: template.documentation + effect.docs,
    communication: template.communication,
    fatigueResistance: template.fatigueResistance + effect.fatigueResistance,
    wage: template.baseWage,
    morale: 70,
    fatigue: 10,
    scheduled: true,
    shift: 'full' as const,
    level: 1,
    xp: 0,
    trainingDaysRemaining: 0,
    certifications: role === 'specialist' ? ['vestibularProgram'] : ['followUp'],
    burnoutRisk: 0.1
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
  staff: state.staff.map((s) => (s.uid === staffId ? { ...s, scheduled: !s.scheduled, shift: s.scheduled ? 'off' : 'full' } : s))
});

export const setStaffShift = (state: GameState, staffId: string, shift: 'off' | 'half' | 'full'): GameState => ({
  ...state,
  staff: state.staff.map((s) => (s.uid === staffId ? { ...s, shift, scheduled: shift !== 'off' } : s))
});

export const assignStaffRoom = (state: GameState, staffId: string, roomType: RoomTypeId | 'flex'): GameState => ({
  ...state,
  staff: state.staff.map((s) => {
    if (s.uid !== staffId) return s;
    if (roomType !== 'flex' && !state.rooms.some((room) => room.type === roomType)) return s;
    if (s.role === 'frontDesk' && roomType !== 'flex' && roomType !== 'reception') return s;
    return { ...s, assignedRoom: roomType };
  })
});

export const startStaffTraining = (state: GameState, staffId: string): GameState => {
  const member = state.staff.find((s) => s.uid === staffId);
  if (!member || member.role === 'frontDesk' || member.trainingDaysRemaining > 0 || state.cash < 900) return state;
  const servicePool = SERVICES.map((s) => s.id);
  if (servicePool.length === 0) return state;
  const service = randomPick(servicePool);
  return {
    ...state,
    cash: state.cash - 900,
    staff: state.staff.map((s) =>
      s.uid === staffId
        ? { ...s, trainingDaysRemaining: 2, scheduled: false, shift: 'off', certifications: s.certifications.includes(service) ? s.certifications : [...s.certifications, service] }
        : s
    ),
    eventLog: [`${member.name} started focused training (${service}).`, ...state.eventLog].slice(0, 12)
  };
};

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
  if (state.pathTiles.some((tile) => tile.x === x && tile.y === y)) return state;
  if (state.cash < def.cost) return state;
  if (def.requiredUpgrade && !state.unlockedUpgrades.includes(def.requiredUpgrade)) return state;

  return {
    ...state,
    cash: state.cash - def.cost,
    rooms: [...state.rooms, { id: uid(), type: roomType, level: 1, equipmentLevel: 1, focusService: 'general', x, y }],
    clinicSize: state.clinicSize + 1
  };
};


export const togglePathTile = (state: GameState, x: number, y: number): GameState => {
  if (state.rooms.some((room) => room.x === x && room.y === y)) return state;
  const exists = state.pathTiles.some((tile) => tile.x === x && tile.y === y);
  return {
    ...state,
    pathTiles: exists ? state.pathTiles.filter((tile) => tile.x !== x || tile.y !== y) : [...state.pathTiles, { x, y }]
  };
};

export const upgradeRoomEquipment = (state: GameState, roomId: string): GameState => {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room || room.equipmentLevel >= 3) return state;
  const cost = 1200 * room.equipmentLevel;
  if (state.cash < cost) return state;
  return {
    ...state,
    cash: state.cash - cost,
    rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, equipmentLevel: r.equipmentLevel + 1 } : r)),
    eventLog: [`Upgraded ${room.type} equipment to tier ${room.equipmentLevel + 1}.`, ...state.eventLog].slice(0, 12)
  };
};

export const setRoomFocus = (state: GameState, roomId: string, serviceId: ServiceId | 'general'): GameState => ({
  ...state,
  rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, focusService: serviceId } : r))
});

export const removeRoom = (state: GameState, roomId: string): GameState => {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room || (['reception', 'waiting', 'treatment', 'gym'].includes(room.type) && state.rooms.filter((r) => r.type === room.type).length <= 1)) return state;
  return {
    ...state,
    rooms: state.rooms.filter((r) => r.id !== roomId),
    placedItems: state.placedItems.filter((item) => item.x !== room.x || item.y !== room.y),
    clinicSize: Math.max(1, state.clinicSize - 1)
  };
};

export const placeBuildItem = (state: GameState, itemId: BuildItemId, x: number, y: number): GameState => {
  const def = getBuildItemDef(itemId);
  if (!def) return state;
  const placementError = getBuildItemPlacementError(state, itemId, x, y);
  if (placementError || state.cash < def.cost) return state;

  return {
    ...state,
    cash: state.cash - def.cost,
    placedItems: [...state.placedItems, { id: uid(), itemId, x, y }],
    eventLog: [`Placed ${def.name}.`, ...state.eventLog].slice(0, 12)
  };
};

export const removeBuildItem = (state: GameState, itemInstanceId: string): GameState => {
  const item = state.placedItems.find((placed) => placed.id === itemInstanceId);
  if (!item) return state;
  const def = getBuildItemDef(item.itemId);
  return {
    ...state,
    placedItems: state.placedItems.filter((placed) => placed.id !== itemInstanceId),
    eventLog: [`Removed ${def?.name ?? item.itemId}.`, ...state.eventLog].slice(0, 12)
  };
};

export const takeLoan = (state: GameState, principal: number): GameState => {
  if (state.mode !== 'campaign' || state.loan || principal < 2000 || principal > 25000) return state;
  const difficulty = getDifficultyPreset(state.difficultyPreset);
  const interestRate = 0.028 * difficulty.loanInterestMultiplier;
  const termWeeks = 8;
  const weeklyPayment = (principal * (1 + interestRate * termWeeks)) / termWeeks;

  return {
    ...state,
    cash: state.cash + principal,
    loan: {
      principal,
      interestRate,
      termWeeks,
      weeksRemaining: termWeeks,
      weeklyPayment
    },
    eventLog: [`Took a financing loan for $${principal}. Weekly payment: $${Math.round(weeklyPayment)}.`, ...state.eventLog].slice(0, 12)
  };
};

export const repayLoan = (state: GameState, amount: number): GameState => {
  if (!state.loan || amount <= 0 || state.cash < amount) return state;
  const remainingPrincipal = Math.max(0, state.loan.principal - amount);
  return {
    ...state,
    cash: state.cash - amount,
    loan: remainingPrincipal <= 0 ? null : { ...state.loan, principal: remainingPrincipal },
    eventLog: [`Paid $${Math.round(amount)} toward loan principal.`, ...state.eventLog].slice(0, 12)
  };
};

export const setBookingPolicy = (state: GameState, policy: BookingPolicy): GameState => {
  if (state.bookingPolicy === policy) return state;
  return {
    ...state,
    bookingPolicy: policy,
    eventLog: [`Booking policy set to ${policy}.`, ...state.eventLog].slice(0, 12)
  };
};

export const chooseIncidentDecision = (state: GameState, incidentId: string, optionId: string): GameState => applyIncidentDecision(state, incidentId, optionId);
