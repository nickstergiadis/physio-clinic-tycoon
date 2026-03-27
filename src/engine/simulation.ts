import { ROOM_DEFS, STAFF_TEMPLATES, UPGRADES } from '../data/content';
import { GameState, RoomTypeId, StaffRoleId } from '../types/game';
import { uid } from './utils';
import { generatePatients, runDay } from './daySimulation';

export { generatePatients, runDay };

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
  if (!room || (['reception', 'waiting', 'treatment', 'gym'].includes(room.type) && state.rooms.filter((r) => r.type === room.type).length <= 1)) return state;
  return { ...state, rooms: state.rooms.filter((r) => r.id !== roomId), clinicSize: Math.max(1, state.clinicSize - 1) };
};
