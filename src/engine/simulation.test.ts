import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { buyUpgrade, fireStaff, generatePatients, hireStaff, placeRoom, runDay, toggleStaffSchedule } from './simulation';

describe('simulation core loop', () => {
  it('generates patient queue with meaningful size', () => {
    const state = createInitialState('campaign');
    const queue = generatePatients(state);
    expect(queue.length).toBeGreaterThan(4);
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
      day: 6,
      week: state.campaignGoal.targetWeek - 1,
      reputation: 100,
      cash: 1_000_000,
      campaignGoal: {
        ...state.campaignGoal,
        targetWeek: state.campaignGoal.targetWeek,
        targetReputation: 90,
        targetCash: 900_000
      }
    };
    const next = runDay(boosted);
    expect(next.gameWon).toBe(true);
  });

  it('failure condition triggers for bankruptcy', () => {
    const state = createInitialState('campaign');
    const insolvent = { ...state, cash: -15000 };
    const next = runDay(insolvent);
    expect(next.gameOver).toBe(true);
  });

  it('opening campaign remains playable for two weeks under default play', () => {
    let state = { ...createInitialState('campaign'), seed: 4242 };
    const dailyProfits: number[] = [];

    for (let i = 0; i < 14; i += 1) {
      state = runDay(state);
      dailyProfits.push(state.latestSummary?.profit ?? 0);
    }

    const catastrophicDays = dailyProfits.filter((profit) => profit < -1200).length;
    expect(state.gameOver).toBe(false);
    expect(state.cash).toBeGreaterThan(4000);
    expect(catastrophicDays).toBeLessThanOrEqual(2);
  });

  it('campaign remains losable under sustained poor management', () => {
    let state = { ...createInitialState('campaign'), seed: 8484, cash: 6000 };
    state = state.staff.reduce((acc, member) => toggleStaffSchedule(acc, member.uid), state);

    for (let i = 0; i < 12 && !state.gameOver; i += 1) {
      state = runDay(state);
    }

    expect(state.gameOver).toBe(true);
    expect(state.cash).toBeLessThan(0);
  });

  it('sandbox economy remains easier than campaign', () => {
    let campaign = { ...createInitialState('campaign'), seed: 2222 };
    let sandbox = { ...createInitialState('sandbox'), seed: 2222 };

    for (let i = 0; i < 7; i += 1) {
      campaign = runDay(campaign);
      sandbox = runDay(sandbox);
    }

    expect(sandbox.cash).toBeGreaterThan(campaign.cash);
    expect(sandbox.reputation).toBeGreaterThanOrEqual(campaign.reputation);
  });
});
