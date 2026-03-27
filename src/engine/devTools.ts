import { PATIENT_ARCHETYPES } from '../data/content';
import { GameState } from '../types/game';
import { runDay } from './daySimulation';
import { uid } from './utils';

export const DEV_HIGH_NO_SHOW_SHIFT = 0.2;

export const addCash = (state: GameState, amount: number): GameState => ({
  ...state,
  cash: state.cash + amount,
  eventLog: [`DEV: Added $${Math.round(amount)} cash.`, ...state.eventLog].slice(0, 12)
});

export const fastForwardDays = (state: GameState, days: number): GameState => {
  let next = state;
  for (let i = 0; i < days; i += 1) {
    if (next.gameOver || next.gameWon) break;
    next = runDay(next);
  }
  return next;
};

export const spawnSamplePatients = (state: GameState, count = 8): GameState => {
  const seededPatients = Array.from({ length: count }).map((_, idx) => {
    const archetype = PATIENT_ARCHETYPES[idx % PATIENT_ARCHETYPES.length];
    const service = archetype.preferredServices.find((serviceId) => state.unlockedServices.includes(serviceId)) ?? state.unlockedServices[0] ?? 'initialAssessment';
    const patientId = uid();
    return {
      patient: {
        id: patientId,
        archetype: archetype.id,
        payerType: idx % 2 === 0 ? 'insured' as const : 'selfPay' as const,
        lifecycleState: 'booked' as const,
        clinicalProgress: 0,
        satisfaction: 0.6,
        patience: archetype.patience,
        adherence: archetype.adherence,
        noShowPropensity: archetype.noShowChance,
        referralLikelihood: archetype.referralValue * 0.4,
        expectedTotalVisits: archetype.expectedVisits,
        remainingVisits: archetype.expectedVisits,
        nextRecommendedService: service,
        futureBookings: [state.day]
      },
      visit: {
        id: uid(),
        patientId,
        archetype: archetype.id,
        service,
        complexity: archetype.complexity,
        insured: idx % 2 === 0,
        status: 'waiting' as const
      }
    };
  });

  return {
    ...state,
    patientQueue: [...state.patientQueue, ...seededPatients.map((entry) => entry.visit)],
    patients: [...state.patients, ...seededPatients.map((entry) => entry.patient)],
    eventLog: [`DEV: Spawned ${seededPatients.length} sample patients.`, ...state.eventLog].slice(0, 12)
  };
};

export const setHighNoShowMode = (state: GameState, enabled: boolean): GameState => ({
  ...state,
  operationalModifiers: {
    ...state.operationalModifiers,
    noShowShift: enabled ? DEV_HIGH_NO_SHOW_SHIFT : 0,
    note: enabled ? 'DEV: High no-show mode enabled.' : undefined
  },
  dev: {
    ...(state.dev ?? { highNoShowMode: false }),
    highNoShowMode: enabled
  },
  eventLog: [`DEV: High no-show mode ${enabled ? 'enabled' : 'disabled'}.`, ...state.eventLog].slice(0, 12)
});
