import { beforeEach, describe, expect, it } from 'vitest';
import { loadSettings, loadSlots, saveSettings, saveSlot } from './persistence';
import { createInitialState } from './state';

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    }
  };
};

describe('persistence', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      writable: true,
      configurable: true
    });
    localStorage.clear();
  });

  it('saves and loads a slot', () => {
    const state = createInitialState('campaign');
    saveSlot('slot-1', 'Campaign Save', state);
    const slots = loadSlots();
    expect(slots).toHaveLength(1);
    expect(slots[0].state.day).toBe(state.day);
  });

  it('sanitizes corrupted state payloads', () => {
    localStorage.setItem('physio_tycoon_slots_v1', JSON.stringify([
      { id: 'slot-x', label: 'Broken', timestamp: Date.now(), version: 0, state: { mode: 'campaign', version: 0, settings: {} } }
    ]));

    const slots = loadSlots();
    expect(slots[0].state.rooms.length).toBeGreaterThan(0);
    expect(Array.isArray(slots[0].state.staff)).toBe(true);
    expect(slots[0].state.scenarioId).toBe('default');
    expect(slots[0].state.difficultyPreset).toBe('standard');
  });

  it('persists settings', () => {
    saveSettings({ soundEnabled: false, ambientEnabled: true, showTutorialHints: false });
    const settings = loadSettings();
    expect(settings.soundEnabled).toBe(false);
    expect(settings.ambientEnabled).toBe(true);
    expect(settings.showTutorialHints).toBe(false);
  });
});
