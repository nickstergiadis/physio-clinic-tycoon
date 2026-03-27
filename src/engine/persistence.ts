import { SAVE_VERSION } from '../data/content';
import { GameState, SaveSlot } from '../types/game';
import { sanitizeState } from './saveMigration';
import { createInitialState } from './state';

const SLOTS_KEY = 'physio_tycoon_slots_v1';
const SETTINGS_KEY = 'physio_tycoon_settings_v1';

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
