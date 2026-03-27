import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../data/content';
import { runDay } from './daySimulation';
import { sanitizeState } from './saveMigration';
import { createInitialState } from './state';
import { fireStaff, placeRoom, removeRoom } from './simulation';

describe('architecture hardening seams', () => {
  it('migrates old version saves to current version and restores defaults', () => {
    const legacy = {
      version: 1,
      mode: 'campaign',
      settings: { soundEnabled: true, ambientEnabled: false, showTutorialHints: true }
    } as unknown as ReturnType<typeof createInitialState>;

    const migrated = sanitizeState(legacy);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.scenarioId).toBe('community_rebuild');
    expect(migrated.dev?.highNoShowMode).toBe(false);
    expect(migrated.staff.length).toBeGreaterThan(0);
  });

  it('runDay preserves core invariants', () => {
    const state = createInitialState('campaign');
    const next = runDay(state);

    expect(next.day).toBe(state.day + 1);
    expect(next.week).toBeGreaterThanOrEqual(state.week);
    expect(next.clinicSize).toBe(next.rooms.length);
    expect(next.reputation).toBeGreaterThanOrEqual(0);
    expect(next.reputation).toBeLessThanOrEqual(100);
    expect(next.fatigueIndex).toBeGreaterThanOrEqual(0);
    expect(next.fatigueIndex).toBeLessThanOrEqual(1);
    expect(next.latestSummary?.day).toBe(next.day);
    expect(next.demandSnapshot.bookedVisits).toBe(next.latestSummary?.bookedVisits);
  });

  it('campaign win and fail checks are both reachable', () => {
    const base = createInitialState('campaign', 'community_rebuild', 'standard');

    const winningState = {
      ...base,
      day: 13,
      week: base.campaignGoal.targetWeek,
      reputation: 95,
      cash: 250000,
      districtTier: 3,
      objectiveProgress: base.objectiveProgress.map((objective) => ({ ...objective, completed: true, completedWeek: 4 }))
    };
    const won = runDay(winningState);
    expect(won.gameWon).toBe(true);

    const failingState = { ...base, day: 30, cash: -45000 };
    const failed = runDay(failingState);
    expect(failed.gameOver).toBe(true);
  });

  it('hire/build/remove edge guards remain stable', () => {
    const state = createInitialState('campaign');

    const duplicateCell = placeRoom(state, 'treatment', state.rooms[0].x, state.rooms[0].y);
    expect(duplicateCell).toBe(state);

    const protectedTypeRoom = state.rooms.find((room) => room.type === 'reception');
    const noRemoveCore = removeRoom(state, protectedTypeRoom!.id);
    expect(noRemoveCore).toBe(state);

    const oneLeft = state.staff.slice(0, 1);
    const keepAtLeastOne = fireStaff({ ...state, staff: oneLeft }, oneLeft[0].uid);
    expect(keepAtLeastOne.staff).toHaveLength(1);
  });
});
