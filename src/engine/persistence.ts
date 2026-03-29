import { SAVE_VERSION } from '../data/content';
import { GameState, SaveSlot } from '../types/game';
import { sanitizeState } from './saveMigration';
import { createInitialState } from './state';

const SLOTS_KEY = 'physio_tycoon_slots_v1';
const AUTOSAVE_KEY = 'physio_tycoon_autosave_v1';
const SETTINGS_KEY = 'physio_tycoon_settings_v1';

export interface ProgressSource {
  source: 'autosave' | 'manual';
  entry: SaveSlot;
}

interface PortableSavePayload {
  format: 'physio-clinic-tycoon-save';
  exportedAt: number;
  entry: SaveSlot;
}

const sanitizeSlot = (slot: Partial<SaveSlot>, fallbackId: string): SaveSlot => {
  const safeState = sanitizeState(slot.state as GameState);
  return {
    id: typeof slot.id === 'string' && slot.id.trim() ? slot.id : fallbackId,
    label: typeof slot.label === 'string' && slot.label.trim() ? slot.label : 'Recovered save',
    timestamp: typeof slot.timestamp === 'number' && Number.isFinite(slot.timestamp) ? slot.timestamp : Date.now(),
    version: typeof slot.version === 'number' && Number.isFinite(slot.version) ? slot.version : SAVE_VERSION,
    state: safeState
  };
};

export const loadSlots = (): SaveSlot[] => {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<SaveSlot>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((slot, index) => sanitizeSlot(slot, `slot-${index + 1}`));
  } catch {
    return [];
  }
};

const persistSlots = (slots: SaveSlot[]) => {
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
};

export const saveSlot = (slotId: string, label: string, state: GameState): SaveSlot[] => {
  const slots = loadSlots();
  const payload: SaveSlot = {
    id: slotId,
    label,
    timestamp: Date.now(),
    version: SAVE_VERSION,
    state: sanitizeState(state)
  };
  const existingIdx = slots.findIndex((s) => s.id === slotId);
  const next = existingIdx >= 0 ? slots.map((s, idx) => (idx === existingIdx ? payload : s)) : [...slots, payload];
  persistSlots(next);
  return next;
};

export const deleteSlot = (slotId: string): SaveSlot[] => {
  const next = loadSlots().filter((s) => s.id !== slotId);
  persistSlots(next);
  return next;
};

export const loadAutosave = (): SaveSlot | null => {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaveSlot>;
    return sanitizeSlot(parsed, 'autosave');
  } catch {
    return null;
  }
};

export const saveAutosave = (state: GameState, label: string): SaveSlot => {
  const payload: SaveSlot = {
    id: 'autosave',
    label,
    timestamp: Date.now(),
    version: SAVE_VERSION,
    state: sanitizeState(state)
  };
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
  return payload;
};

export const clearAutosave = (): void => {
  localStorage.removeItem(AUTOSAVE_KEY);
};

export const clearAllSaveData = (): void => {
  localStorage.removeItem(SLOTS_KEY);
  localStorage.removeItem(AUTOSAVE_KEY);
};

export const getLatestProgress = (): ProgressSource | null => {
  const autosave = loadAutosave();
  const newestManual = [...loadSlots()].sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
  if (!autosave && !newestManual) return null;
  if (autosave && (!newestManual || autosave.timestamp >= newestManual.timestamp)) {
    return { source: 'autosave', entry: autosave };
  }
  if (newestManual) {
    return { source: 'manual', entry: newestManual };
  }
  return null;
};

export const exportSlot = (slot: SaveSlot): string => {
  const payload: PortableSavePayload = {
    format: 'physio-clinic-tycoon-save',
    exportedAt: Date.now(),
    entry: {
      ...slot,
      state: sanitizeState(slot.state),
      version: SAVE_VERSION
    }
  };
  return JSON.stringify(payload, null, 2);
};

export const importSaveFromText = (rawText: string): SaveSlot => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('Save file format is invalid.');
  const maybePayload = parsed as Partial<PortableSavePayload>;
  if (maybePayload.format !== 'physio-clinic-tycoon-save' || !maybePayload.entry) {
    throw new Error('Unsupported save file format.');
  }

  const imported = sanitizeSlot(maybePayload.entry, 'imported-save');
  const importTime = Date.now();
  return {
    ...imported,
    id: `import-${importTime}`,
    label: imported.label.startsWith('Imported:') ? imported.label : `Imported: ${imported.label}`,
    timestamp: importTime,
    version: SAVE_VERSION
  };
};

export const insertImportedSlot = (slot: SaveSlot): SaveSlot[] => {
  const slots = loadSlots();
  const next = [slot, ...slots].slice(0, 12);
  persistSlots(next);
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
