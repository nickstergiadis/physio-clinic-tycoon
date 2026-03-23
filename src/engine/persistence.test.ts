import { beforeEach, describe, expect, it } from 'vitest';
import { loadSettings, loadSlots, saveSettings, saveSlot } from './persistence';
import { createInitialState } from './state';

describe('persistence', () => {
  beforeEach(() => {
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
  });

  it('persists settings', () => {
    saveSettings({ soundEnabled: false, ambientEnabled: true, showTutorialHints: false });
    const settings = loadSettings();
    expect(settings.soundEnabled).toBe(false);
    expect(settings.ambientEnabled).toBe(true);
    expect(settings.showTutorialHints).toBe(false);
  });
});
