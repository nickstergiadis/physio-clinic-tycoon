import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { buyUpgrade, generatePatients, hireStaff, placeRoom, runDay } from './simulation';

describe('simulation core loop', () => {
  it('generates patient queue with meaningful size', () => {
    const state = createInitialState('campaign');
    const queue = generatePatients(state);
    expect(queue.length).toBeGreaterThan(3);
  });

  it('runDay advances timeline and produces summary', () => {
    const state = createInitialState('campaign');
    const next = runDay(state);
    expect(next.day).toBe(state.day + 1);
    expect(next.latestSummary).toBeTruthy();
  });

  it('hiring staff consumes cash and adds member', () => {
    const state = createInitialState('sandbox');
    const next = hireStaff(state, 'specialist');
    expect(next.staff.length).toBe(state.staff.length + 1);
    expect(next.cash).toBeLessThan(state.cash);
  });

  it('buying an upgrade unlocks effects', () => {
    const state = createInitialState('sandbox');
    const next = buyUpgrade(state, 'vestibular_suite');
    expect(next.unlockedUpgrades).toContain('vestibular_suite');
    expect(next.unlockedRooms).toContain('vestibularLab');
  });

  it('placing room spends cash and adds room', () => {
    const state = createInitialState('sandbox');
    const next = placeRoom(state, 'treatment', 4, 4);
    expect(next.rooms.length).toBe(state.rooms.length + 1);
    expect(next.cash).toBeLessThan(state.cash);
  });
});
