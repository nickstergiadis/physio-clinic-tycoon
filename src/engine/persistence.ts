import { SAVE_VERSION } from '../data/content';
import { GameState, SaveSlot } from '../types/game';
import { createInitialState } from './state';

const SLOTS_KEY = 'physio_tycoon_slots_v1';
const SETTINGS_KEY = 'physio_tycoon_settings_v1';

const sanitizeState = (state: GameState): GameState => {
  if (!state || typeof state !== 'object') return createInitialState('campaign');
  const base = createInitialState(state.mode ?? 'campaign');
  const merged: GameState = {
    ...base,
    ...state,
    version: SAVE_VERSION,
    staff: Array.isArray(state.staff) ? state.staff : base.staff,
    rooms: Array.isArray(state.rooms) ? state.rooms : base.rooms,
    unlockedUpgrades: Array.isArray(state.unlockedUpgrades) ? state.unlockedUpgrades : base.unlockedUpgrades,
    unlockedRooms: Array.isArray(state.unlockedRooms) ? state.unlockedRooms : base.unlockedRooms,
    unlockedServices: Array.isArray(state.unlockedServices) ? state.unlockedServices : base.unlockedServices,
    patientQueue: Array.isArray(state.patientQueue) ? state.patientQueue : base.patientQueue,
    eventLog: Array.isArray(state.eventLog) ? state.eventLog : base.eventLog,
    settings: {
      soundEnabled: Boolean(state.settings?.soundEnabled ?? base.settings.soundEnabled),
      ambientEnabled: Boolean(state.settings?.ambientEnabled ?? base.settings.ambientEnabled),
      showTutorialHints: Boolean(state.settings?.showTutorialHints ?? base.settings.showTutorialHints)
    },
    campaignGoal: {
      targetWeek: state.campaignGoal?.targetWeek ?? base.campaignGoal.targetWeek,
      targetReputation: state.campaignGoal?.targetReputation ?? base.campaignGoal.targetReputation,
      targetCash: state.campaignGoal?.targetCash ?? base.campaignGoal.targetCash
    }
  };

  merged.clinicSize = merged.rooms.length;
  merged.maxClinicSize = Math.max(merged.maxClinicSize, 6);
  merged.speed = [0, 1, 2, 3].includes(merged.speed) ? merged.speed : 0;
  return merged;
};

export const loadSlots = (): SaveSlot[] => {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SaveSlot[];
    return parsed.map((slot) => ({ ...slot, state: sanitizeState(slot.state) }));
  } catch {
    return [];
  }
};

export const saveSlot = (slotId: string, label: string, state: GameState): SaveSlot[] => {
  const slots = loadSlots();
  const payload: SaveSlot = { id: slotId, label, timestamp: Date.now(), version: SAVE_VERSION, state: sanitizeState(state) };
  const existingIdx = slots.findIndex((s) => s.id === slotId);
  const next = existingIdx >= 0 ? slots.map((s, idx) => (idx === existingIdx ? payload : s)) : [...slots, payload];
  localStorage.setItem(SLOTS_KEY, JSON.stringify(next));
  return next;
};

export const deleteSlot = (slotId: string): SaveSlot[] => {
  const next = loadSlots().filter((s) => s.id !== slotId);
  localStorage.setItem(SLOTS_KEY, JSON.stringify(next));
  return next;
};

export const loadSettings = (): GameState['settings'] => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return createInitialState('campaign').settings;
    const parsed = JSON.parse(raw) as GameState['settings'];
    return {
      soundEnabled: Boolean(parsed.soundEnabled),
      ambientEnabled: Boolean(parsed.ambientEnabled),
      showTutorialHints: Boolean(parsed.showTutorialHints)
    };
  } catch {
    return createInitialState('campaign').settings;
  }
};

export const saveSettings = (settings: GameState['settings']): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};
