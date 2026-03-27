import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { runDay } from './simulation';
import { updatePatientJourneys } from './patientJourney';
import { PersistentPatient } from '../types/game';

const makePatient = (id: string): PersistentPatient => ({
  id,
  archetype: 'officeWorker',
  payerType: 'insured',
  lifecycleState: 'booked',
  clinicalProgress: 0.1,
  satisfaction: 0.6,
  patience: 0.6,
  adherence: 0.65,
  noShowPropensity: 0.12,
  referralLikelihood: 0.2,
  expectedTotalVisits: 6,
  remainingVisits: 5,
  nextRecommendedService: 'followUp',
  futureBookings: [2],
  lastTransitionDay: 1
});

describe('persistent patient journeys', () => {
  it('persists patients across days', () => {
    let state = { ...createInitialState('campaign'), seed: 4422 };
    state = runDay(state);
    expect(state.patients.length).toBeGreaterThan(0);

    const trackedId = state.patients[0].id;
    state = runDay(state);

    expect(state.patients.some((patient) => patient.id === trackedId)).toBe(true);
  });

  it('good completed visits improve rebooking/referral tendency', () => {
    const state = { ...createInitialState('campaign'), seed: 1001, day: 2, patients: [makePatient('p-good')] };
    const [updated] = updatePatientJourneys(state, 2, [
      { patientId: 'p-good', result: 'completed', wait: 6, outcome: 0.9, satisfaction: 0.9, service: 'followUp' }
    ]);

    expect(updated.referralLikelihood).toBeGreaterThan(0.2);
    expect(updated.satisfaction).toBeGreaterThan(0.6);
    expect(updated.lifecycleState === 'booked' || updated.lifecycleState === 'needsFollowUp' || updated.lifecycleState === 'discharged').toBe(true);
  });

  it('bad wait/outcome pressure causes more dropout than good care', () => {
    const base = createInitialState('campaign');
    const cohort = Array.from({ length: 120 }, (_, idx) => makePatient(`p-${idx}`));
    const badState = { ...base, seed: 7001, day: 2, patients: cohort };
    const goodState = { ...base, seed: 7001, day: 2, patients: cohort };

    const badEvents = cohort.map((patient) => ({ patientId: patient.id, result: 'unserved' as const, wait: 0, outcome: 0, satisfaction: 0, service: 'followUp' as const }));
    const goodEvents = cohort.map((patient) => ({ patientId: patient.id, result: 'completed' as const, wait: 2, outcome: 0.92, satisfaction: 0.92, service: 'followUp' as const }));

    const badPatients = updatePatientJourneys(badState, 2, badEvents);
    const goodPatients = updatePatientJourneys(goodState, 2, goodEvents);

    const badDropouts = badPatients.filter((patient) => patient.lifecycleState === 'droppedOut').length;
    const goodDropouts = goodPatients.filter((patient) => patient.lifecycleState === 'droppedOut').length;

    expect(badDropouts).toBeGreaterThan(goodDropouts);
  });
});
