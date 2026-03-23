import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { buyUpgrade, fireStaff, generatePatients, hireStaff, placeRoom, runDay, toggleStaffSchedule } from './simulation';

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

  it('new game flow starts paused and can complete first day', () => {
    const state = createInitialState('campaign');
    expect(state.paused).toBe(true);
    const next = runDay(state);
    expect(next.day).toBe(2);
    expect(next.latestSummary?.day).toBe(2);
  });

  it('handles no scheduled staff without crashing', () => {
    const state = createInitialState('campaign');
    const unscheduled = state.staff.reduce((acc, member) => toggleStaffSchedule(acc, member.uid), state);
    const next = runDay(unscheduled);
    expect(next.latestSummary?.treated).toBe(0);
    expect(next.latestSummary?.notes.some((note) => note.includes('No staff were scheduled'))).toBe(true);
  });

  it('staffing flow can fire while keeping at least one member', () => {
    const state = createInitialState('campaign');
    const fired = fireStaff(state, state.staff[0].uid);
    expect(fired.staff.length).toBe(state.staff.length - 1);
    const keepOne = fireStaff(fireStaff(fired, fired.staff[0].uid), fired.staff[1]?.uid ?? '');
    expect(keepOne.staff.length).toBe(1);
  });

  it('campaign success condition can trigger', () => {
    const state = createInitialState('campaign');
    const boosted = {
      ...state,
      week: state.campaignGoal.targetWeek,
      reputation: state.campaignGoal.targetReputation,
      cash: state.campaignGoal.targetCash
    };
    const next = runDay(boosted);
    expect(next.gameWon).toBe(true);
  });

  it('failure condition triggers for bankruptcy', () => {
    const state = createInitialState('campaign');
    const insolvent = { ...state, cash: -6000 };
    const next = runDay(insolvent);
    expect(next.gameOver).toBe(true);
  });
});
