import { SERVICES } from '../data/content';
import { GameState, PatientVisit } from '../types/game';
import { BALANCE } from './simulationConfig';
import { rand, uid } from './utils';
import { weightedArchetype } from './demandGeneration';

const unlockedServiceSet = (state: GameState): Set<string> => new Set(state.unlockedServices);

export interface AppointmentBuild {
  booked: PatientVisit[];
  lostUnbooked: number;
  lostServiceMismatch: number;
}

export const generateAppointments = (state: GameState, leads: number, bookingRate: number): AppointmentBuild => {
  const unlockedServices = unlockedServiceSet(state);
  const booked: PatientVisit[] = [];
  let lostUnbooked = 0;
  let lostServiceMismatch = 0;

  for (let i = 0; i < leads; i += 1) {
    const seed = state.seed + state.day * 97 + i * 17;
    if (rand(seed + 99) > bookingRate) {
      lostUnbooked += 1;
      continue;
    }

    const archetype = weightedArchetype(seed, state);
    const servicePool = archetype.preferredServices.filter((serviceId) => unlockedServices.has(serviceId));
    const service = servicePool[Math.floor(rand(seed + 3) * servicePool.length)];
    const resolvedService = SERVICES.find((serviceDef) => serviceDef.id === service)?.id;

    if (!resolvedService) {
      lostServiceMismatch += 1;
      continue;
    }

    booked.push({
      id: uid(),
      patientId: uid(),
      archetype: archetype.id,
      service: resolvedService,
      complexity: archetype.complexity,
      insured: rand(seed + 7) > BALANCE.uninsuredThreshold,
      status: 'waiting'
    });
  }

  return { booked, lostUnbooked, lostServiceMismatch };
};
