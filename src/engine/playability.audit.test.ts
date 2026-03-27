import { describe, expect, it, beforeEach } from 'vitest';
import { buyUpgrade, hireStaff, placeRoom, runDay, takeLoan } from './simulation';
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
      day: 21,
      week: 6,
      cash: -35000
    };
    const failed = runDay(failState);
    expect(failed.gameOver).toBe(true);

    const winState = {
      ...createInitialState('campaign'),
      day: 84,
      week: 12,
      cash: 54000,
      reputation: 80,
      districtTier: 3,
      objectiveProgress: createInitialState('campaign').objectiveProgress.map((objective) => ({ ...objective, completed: true, completedWeek: 8 }))
    };
    const won = runDay(winState);
    expect(won.gameWon).toBe(true);
  });

  it('keeps scenario start, save-load, and tab state transitions stable', () => {
    let state = createInitialState('campaign', 'sports_performance', 'hardcore');
    expect(state.scenarioId).toBe('sports_performance');
    expect(state.selectedTab).toBe('overview');

    state = { ...state, selectedTab: 'finance' };
    state = runDay(state);
    saveSlot('slot-2', 'tab-regression', state);

    const loaded = loadSlots().find((slot) => slot.id === 'slot-2')?.state;
    expect(loaded).toBeDefined();
    expect(loaded?.scenarioId).toBe('sports_performance');
    expect(loaded?.selectedTab).toBe('finance');
    expect(loaded?.latestSummary?.day).toBe(2);
  });

  it('keeps bad-then-corrected early decisions recoverable in campaign', () => {
    let state = { ...createInitialState('campaign', 'insurance_crunch', 'standard'), seed: 5151 };

    state = hireStaff(state, 'specialist');
    state = placeRoom(state, 'treatment', 2, 2);
    state = runDay(state);
    state = runDay(state);

    const stressedCash = state.cash;
    state = takeLoan(state, 6000);
    state = buyUpgrade(state, 'online_booking');
    state = buyUpgrade(state, 'ehr_automation');

    for (let i = 0; i < 14; i += 1) state = runDay(state);

    expect(stressedCash).toBeLessThan(createInitialState('campaign', 'insurance_crunch', 'standard').cash);
    expect(state.gameOver).toBe(false);
    expect((state.latestSummary?.profit ?? -5000)).toBeGreaterThan(-1200);
    expect((state.latestSummary?.lostDemand.noShows ?? 99)).toBeLessThan(5);
  });
});
