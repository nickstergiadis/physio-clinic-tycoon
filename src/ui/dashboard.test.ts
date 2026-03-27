import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/state';
import { runDay } from '../engine/simulation';
import { formatSignedCurrency, getClinicDrivers, getDemandPressure, getFinanceSnapshot, getStaffInsights } from './dashboard';

describe('dashboard insights', () => {
  it('formats signed currency clearly for gains and losses', () => {
    expect(formatSignedCurrency(250)).toBe('+$250');
    expect(formatSignedCurrency(-125)).toBe('-$125');
  });

  it('computes finance snapshot after a simulated day', () => {
    const state = runDay(createInitialState('campaign'));
    const snapshot = getFinanceSnapshot(state);
    expect(Number.isFinite(snapshot.marginPct)).toBe(true);
    expect(snapshot.runwayWeeks).toBeGreaterThanOrEqual(0);
    expect(snapshot.docsPenaltyEstimate).toBeGreaterThanOrEqual(0);
  });

  it('surfaces default onboarding drivers before first simulated day', () => {
    const state = createInitialState('campaign');
    const drivers = getClinicDrivers(state);
    expect(drivers[0].label).toContain('No operating data yet');
  });

  it('highlights staff and demand pressure metrics with daily summary data', () => {
    const state = runDay(createInitialState('campaign'));
    const staffInsights = getStaffInsights(state);
    const demandInsights = getDemandPressure(state.latestSummary);
    expect(staffInsights).toHaveLength(4);
    expect(demandInsights[0].value).toContain('→');
  });
});
