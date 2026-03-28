import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { assignStaffRoom, buyUpgrade, chooseIncidentDecision, fireStaff, generatePatients, hireStaff, placeBuildItem, placeRoom, runDay, startStaffTraining, toggleStaffSchedule } from './simulation';

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

  it('places build items with placement rules and grants bonuses', () => {
    let state = createInitialState('sandbox');
    const starting = state.placedItems.length;
    state = placeBuildItem(state, 'waiting_chairs', 1, 0);
    expect(state.placedItems.length).toBe(starting + 1);

    const invalid = placeBuildItem(state, 'front_desk_pod', 1, 0);
    expect(invalid).toBe(state);
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
    const state = createInitialState('campaign', 'community_rebuild', 'standard');
    const boosted = {
      ...state,
      day: 6,
      week: state.campaignGoal.targetWeek,
      reputation: 100,
      cash: 1_000_000,
      districtTier: 3,
      objectiveProgress: state.objectiveProgress.map((objective) => ({ ...objective, completed: true, completedWeek: 5 }))
    };
    const next = runDay(boosted);
    expect(next.gameWon).toBe(true);
  });

  it('failure condition triggers for bankruptcy', () => {
    const state = createInitialState('campaign');
    const insolvent = { ...state, day: 20, cash: -30000 };
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
    expect(state.cash).toBeGreaterThan(2000);
    expect(catastrophicDays).toBeLessThanOrEqual(2);
  });

  it('campaign remains losable under sustained poor management', () => {
    let state = { ...createInitialState('campaign'), seed: 8484, cash: 6000 };
    state = state.staff.reduce((acc, member) => toggleStaffSchedule(acc, member.uid), state);

    for (let i = 0; i < 28 && !state.gameOver; i += 1) {
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

  it('tracks demand funnel and lost-demand reasons', () => {
    const state = createInitialState('campaign');
    const next = runDay(state);
    expect(next.latestSummary?.inboundLeads).toBeGreaterThan(0);
    expect(next.latestSummary?.bookedVisits).toBeGreaterThanOrEqual(0);
    expect((next.latestSummary?.lostDemand.capacity ?? 0) + (next.latestSummary?.lostDemand.unbooked ?? 0)).toBeGreaterThanOrEqual(0);
    expect(next.demandSnapshot.inboundLeads).toBe(next.latestSummary?.inboundLeads);
  });

  it('applies weekly fixed costs on a 7-day cadence', () => {
    let state = createInitialState('campaign');
    for (let i = 0; i < 6; i += 1) state = runDay(state);
    expect(state.latestSummary?.fixedCosts).toBeGreaterThan(0);
    state = runDay(state);
    expect(state.latestSummary?.fixedCosts).toBe(0);
  });

  it('generates weekly reports and bounded daily trend history', () => {
    let state = { ...createInitialState('campaign'), seed: 5151 };
    for (let i = 0; i < 28; i += 1) state = runDay(state);
    expect(state.weeklyReports.length).toBeGreaterThanOrEqual(4);
    expect(state.weeklyReports[0].week).toBeGreaterThanOrEqual(1);
    const lastReport = state.weeklyReports[state.weeklyReports.length - 1];
    expect(lastReport?.endDay).toBe(state.day - 1);
    expect(state.dailyTrends.length).toBeLessThanOrEqual(84);
    const lastTrend = state.dailyTrends[state.dailyTrends.length - 1];
    expect(lastTrend?.day).toBe(state.day);
  });

  it('keeps standard mode fairer than hardcore under same seed', () => {
    let standard = { ...createInitialState('campaign', 'community_rebuild', 'standard'), seed: 9191 };
    let hardcore = { ...createInitialState('campaign', 'community_rebuild', 'hardcore'), seed: 9191 };
    for (let i = 0; i < 14; i += 1) {
      standard = runDay(standard);
      hardcore = runDay(hardcore);
    }

    expect(standard.cash).toBeGreaterThan(hardcore.cash);
    expect(standard.reputation).toBeGreaterThanOrEqual(hardcore.reputation - 5);
  });

  it('small setback can be recovered with one operational improvement', () => {
    let state = { ...createInitialState('campaign'), seed: 6123, cash: 9000 };
    state = runDay(state);
    const afterSetback = { ...state, cash: state.cash - 2500 };
    const stabilized = buyUpgrade(afterSetback, 'online_booking');

    let recovered = stabilized;
    let baseline = afterSetback;
    for (let i = 0; i < 14; i += 1) {
      recovered = runDay(recovered);
      baseline = runDay(baseline);
    }

    expect(recovered.gameOver).toBe(false);
    expect(recovered.cash).toBeGreaterThan(-20000);
    expect((recovered.latestSummary?.lostDemand.noShows ?? 99)).toBeLessThanOrEqual(baseline.latestSummary?.lostDemand.noShows ?? 99);
    expect((recovered.latestSummary?.profit ?? -9999)).toBeGreaterThan((baseline.latestSummary?.profit ?? -9999) - 500);
  });

  it('blocks front desk training to avoid invalid service certification state', () => {
    const state = createInitialState('campaign');
    const frontDesk = state.staff.find((member) => member.role === 'frontDesk');
    expect(frontDesk).toBeTruthy();

    const next = startStaffTraining(state, frontDesk!.uid);
    expect(next).toBe(state);
  });

  it('prevents assigning staff to room types not built in the clinic', () => {
    const state = createInitialState('campaign');
    const clinician = state.staff.find((member) => member.role === 'physio');
    expect(clinician).toBeTruthy();

    const invalid = assignStaffRoom(state, clinician!.uid, 'hydro');
    expect(invalid.staff.find((member) => member.uid === clinician!.uid)?.assignedRoom).toBe(clinician!.assignedRoom);
  });

  it('allows incident decisions to alter state and clear pending prompt', () => {
    const state = createInitialState('campaign');
    const seeded = {
      ...state,
      activeIncidents: [
        {
          id: 'incident-x',
          chainId: 'test',
          name: 'Test Incident',
          description: 'For testing',
          startedDay: state.day,
          daysRemaining: 2,
          stage: 'trigger' as const,
          effectsSummary: 'test',
          ongoingEffects: {},
          pendingDecision: {
            stage: 'trigger' as const,
            prompt: 'Choose',
            defaultOptionId: 'a',
            options: [
              { id: 'a', label: 'Spend', description: 'Lose cash', effects: { cash: -100 } },
              { id: 'b', label: 'Hold', description: 'No-op' }
            ]
          }
        }
      ]
    };

    const next = chooseIncidentDecision(seeded, 'incident-x', 'a');
    expect(next.cash).toBe(seeded.cash - 100);
    expect(next.activeIncidents[0].pendingDecision).toBeUndefined();
    expect(next.activeIncidents[0].stage).toBe('ongoing');
  });
});
