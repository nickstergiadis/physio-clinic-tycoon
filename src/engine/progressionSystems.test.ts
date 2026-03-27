import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PRESETS } from '../data/content';
import { evaluateObjectives } from './campaign';
import { runDay } from './daySimulation';
import { createInitialState } from './state';
import { repayLoan, takeLoan } from './simulation';

describe('progression and campaign systems', () => {
  it('evaluates scenario objectives against game state metrics', () => {
    const state = createInitialState('campaign', 'community_rebuild', 'standard');
    const progressed = evaluateObjectives({ ...state, cash: 36000, reputation: 72, districtTier: 2 });
    expect(progressed.objectiveProgress.every((objective) => objective.completed)).toBe(true);
  });

  it('difficulty presets materially alter operational pressure', () => {
    const relaxed = DIFFICULTY_PRESETS.find((preset) => preset.id === 'relaxed')!;
    const hard = DIFFICULTY_PRESETS.find((preset) => preset.id === 'hardcore')!;
    expect(hard.expenseMultiplier).toBeGreaterThan(relaxed.expenseMultiplier);
    expect(hard.noShowShift).toBeGreaterThan(relaxed.noShowShift);
    expect(hard.loanInterestMultiplier).toBeGreaterThan(relaxed.loanInterestMultiplier);
  });

  it('reputation tier unlock rewards apply once and remain consistent', () => {
    let state = createInitialState('campaign', 'community_rebuild', 'standard');
    state = runDay({ ...state, reputation: 80, cash: state.cash });
    expect(state.districtTier).toBeGreaterThanOrEqual(2);
    expect(new Set(state.unlockedTierRewards).size).toBe(state.unlockedTierRewards.length);
  });

  it('loan edge case: over-repay clears debt cleanly', () => {
    let state = createInitialState('campaign', 'insurance_crunch', 'standard');
    state = takeLoan(state, 10000);
    expect(state.loan).toBeTruthy();
    state = { ...state, cash: 50000 };
    state = repayLoan(state, 15000);
    expect(state.loan).toBeNull();
    expect(state.cash).toBe(35000);
  });
});
