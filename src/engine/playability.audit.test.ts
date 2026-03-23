import { describe, expect, it, beforeEach } from 'vitest';
import { buyUpgrade, hireStaff, placeRoom, runDay } from './simulation';
import { createInitialState } from './state';
import { deleteSlot, loadSlots, saveSlot } from './persistence';

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

describe('playability go-live audit flow', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
  });

  it('supports key campaign actions coherently across multiple days', () => {
    let state = createInitialState('campaign');

    // run multiple days
    state = runDay(state);
    state = runDay(state);
    state = runDay(state);
    expect(state.day).toBe(4);
    expect(state.latestSummary).toBeDefined();

    // build mode action
    const built = placeRoom(state, 'treatment', 2, 2);
    expect(built).not.toBe(state);
    state = built;

    // hire staff action
    const hired = hireStaff(state, 'assistant');
    expect(hired.staff.length).toBe(state.staff.length + 1);
    state = hired;

    // buy upgrade action
    const funded = { ...state, cash: Math.max(state.cash, 6000) };
    const upgraded = buyUpgrade(funded, 'ehr_automation');
    expect(upgraded.unlockedUpgrades).toContain('ehr_automation');
    state = upgraded;

    // save and reload action
    saveSlot('slot-1', 'audit-slot', state);
    const slots = loadSlots();
    expect(slots.length).toBe(1);
    expect(slots[0].state.day).toBe(state.day);
    deleteSlot('slot-1');
    expect(loadSlots().length).toBe(0);
  });

  it('reports coherent failure and success thresholds', () => {
    const failState = {
      ...createInitialState('campaign'),
      cash: -6001
    };
    const failed = runDay(failState);
    expect(failed.gameOver).toBe(true);

    const winState = {
      ...createInitialState('campaign'),
      day: 84,
      week: 12,
      cash: 62000,
      reputation: 82
    };
    const won = runDay(winState);
    expect(won.gameWon).toBe(true);
  });
});
