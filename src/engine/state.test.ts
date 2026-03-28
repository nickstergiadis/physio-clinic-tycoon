import { describe, expect, it } from 'vitest';
import { objectiveStatus } from './campaign';
import { createInitialState } from './state';
import { ScenarioId } from '../types/game';

describe('createInitialState', () => {
  it('normalizes unknown scenario ids to a valid campaign scenario', () => {
    const invalidScenarioId = 'legacy_removed_scenario' as ScenarioId;
    const state = createInitialState('campaign', invalidScenarioId);

    expect(state.scenarioId).toBe('community_rebuild');
    expect(() => objectiveStatus(state)).not.toThrow();
  });
});
