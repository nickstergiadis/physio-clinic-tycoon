import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { buyUpgrade, hireStaff, placeRoom, runDay, upgradeRoomEquipment } from './simulation';

describe('economy and progression balance', () => {
  it('keeps early campaign solvent for a reasonable baseline schedule', () => {
    let state = { ...createInitialState('campaign', 'community_rebuild', 'standard'), seed: 2026 };

    for (let i = 0; i < 14; i += 1) state = runDay(state);

    expect(state.gameOver).toBe(false);
    expect(state.cash).toBeGreaterThan(-9000);
    expect(state.reputation).toBeGreaterThan(20);
  });

  it('prevents runaway referral snowball late-game', () => {
    let state = { ...createInitialState('sandbox', 'sports_performance', 'relaxed'), seed: 4040 };
    state = { ...state, referrals: 50, reputation: 88, cash: 90000 };
    state = buyUpgrade(state, 'community_marketing');
    state = buyUpgrade(state, 'online_booking');
    state = buyUpgrade(state, 'premium_branding');

    for (let i = 0; i < 10; i += 1) state = runDay(state);

    expect(state.referrals).toBeLessThanOrEqual(80);
    expect(state.latestSummary?.inboundLeads ?? 0).toBeLessThanOrEqual(58);
  });

  it('expansion + staffing investment produces sustained operational upside', () => {
    let baseline = { ...createInitialState('campaign', 'sports_performance', 'standard'), seed: 7171 };
    let invested = { ...baseline, cash: baseline.cash + 8000 };

    invested = placeRoom(invested, 'treatment', 2, 2);
    invested = hireStaff(invested, 'assistant');
    invested = buyUpgrade(invested, 'online_booking');
    const treatmentRoom = invested.rooms.find((room) => room.type === 'treatment' && room.x === 2 && room.y === 2);
    if (treatmentRoom) invested = upgradeRoomEquipment(invested, treatmentRoom.id);

    for (let i = 0; i < 84; i += 1) {
      baseline = runDay(baseline);
      invested = runDay(invested);
    }

    expect((invested.lifetimeStats.attendedVisits - baseline.lifetimeStats.attendedVisits)).toBeGreaterThan(45);
    expect(invested.reputation).toBeGreaterThan(8);
    expect((invested.latestSummary?.lostDemand.capacity ?? 99)).toBeLessThanOrEqual(baseline.latestSummary?.lostDemand.capacity ?? 99);
  });
});
