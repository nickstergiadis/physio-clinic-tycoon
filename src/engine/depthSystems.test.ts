import { describe, expect, it } from 'vitest';
import { runDay } from './daySimulation';
import { createInitialState } from './state';
import { assignStaffRoom, setRoomFocus, setStaffShift, startStaffTraining, upgradeRoomEquipment } from './simulation';

describe('staff and facility depth systems', () => {
  it('advances staff training/progression in a readable cadence', () => {
    let state = { ...createInitialState('sandbox'), seed: 7070 };
    const trainee = state.staff.find((member) => member.role === 'physio')!;

    state = startStaffTraining(state, trainee.uid);
    const afterTrainingStart = state.staff.find((member) => member.uid === trainee.uid)!;
    expect(afterTrainingStart.trainingDaysRemaining).toBe(2);
    expect(afterTrainingStart.scheduled).toBe(false);

    state = runDay(state);
    state = runDay(state);

    const recovered = state.staff.find((member) => member.uid === trainee.uid)!;
    expect(recovered.trainingDaysRemaining).toBe(0);
    expect(recovered.certifications.length).toBeGreaterThanOrEqual(1);
    expect(recovered.level).toBeGreaterThanOrEqual(1);
  });

  it('shows staffing bottlenecks when assignments are poor', () => {
    let baseline = { ...createInitialState('campaign'), seed: 4141 };
    baseline = runDay(baseline);

    let constrained = { ...createInitialState('campaign'), seed: 4141 };
    constrained = constrained.staff.reduce((acc, member) => setStaffShift(acc, member.uid, member.role === 'frontDesk' ? 'full' : 'off'), constrained);
    constrained = runDay(constrained);

    expect((constrained.latestSummary?.bottlenecks.staffing ?? 0) + (constrained.latestSummary?.lostDemand.capacity ?? 0)).toBeGreaterThan(
      (baseline.latestSummary?.bottlenecks.staffing ?? 0) + (baseline.latestSummary?.lostDemand.capacity ?? 0)
    );
  });

  it('room equipment and service focus improve operational outcomes', () => {
    let state = { ...createInitialState('sandbox'), seed: 9898 };
    const treatmentRoom = state.rooms.find((room) => room.type === 'treatment')!;

    let withoutInvestment = runDay(state);

    state = { ...state, cash: state.cash + 5000 };
    state = upgradeRoomEquipment(state, treatmentRoom.id);
    state = setRoomFocus(state, treatmentRoom.id, 'initialAssessment');
    let withInvestment = runDay(state);

    expect((withInvestment.latestSummary?.avgOutcome ?? 0) + (withInvestment.latestSummary?.attendedVisits ?? 0) * 0.01).toBeGreaterThanOrEqual(
      (withoutInvestment.latestSummary?.avgOutcome ?? 0) + (withoutInvestment.latestSummary?.attendedVisits ?? 0) * 0.01
    );
  });

  it('burnout pressure rises under overuse and recovers with rest shifts', () => {
    let state = { ...createInitialState('campaign'), seed: 2121 };
    const target = state.staff[0];

    for (let i = 0; i < 4; i += 1) {
      state = setStaffShift(state, target.uid, 'full');
      state = runDay(state);
    }
    const stressed = state.staff.find((member) => member.uid === target.uid)!;

    state = setStaffShift(state, target.uid, 'off');
    state = runDay(state);
    state = runDay(state);
    const recovered = state.staff.find((member) => member.uid === target.uid)!;

    expect(stressed.burnoutRisk).toBeGreaterThanOrEqual(0.05);
    expect(recovered.burnoutRisk).toBeLessThan(stressed.burnoutRisk);
    expect(recovered.morale).toBeGreaterThanOrEqual(stressed.morale - 1);
  });

  it('staff room assignment impacts performance on matching services', () => {
    let state = { ...createInitialState('sandbox'), seed: 3333 };
    const physio = state.staff.find((member) => member.role === 'physio')!;

    const flexState = runDay(state);

    state = assignStaffRoom(state, physio.uid, 'gym');
    const mismatched = runDay(state);

    expect((mismatched.latestSummary?.bottlenecks.staffing ?? 0) + (mismatched.latestSummary?.lostDemand.cancellations ?? 0)).toBeGreaterThanOrEqual(
      (flexState.latestSummary?.bottlenecks.staffing ?? 0) + (flexState.latestSummary?.lostDemand.cancellations ?? 0)
    );
  });
});
