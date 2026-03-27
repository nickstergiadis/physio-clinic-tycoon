import { PATIENT_ARCHETYPES, SERVICES } from '../data/content';
import { GameState, PatientArchetype, PatientVisit, PersistentPatient, ServiceId } from '../types/game';
import { BALANCE } from './simulationConfig';
import { clamp, rand, uid } from './utils';
import { weightedArchetype } from './demandGeneration';

const archetypeById = (id: PersistentPatient['archetype']): PatientArchetype => PATIENT_ARCHETYPES.find((archetype) => archetype.id === id) ?? PATIENT_ARCHETYPES[0];

const pickService = (state: GameState, archetype: PatientArchetype, seed: number): ServiceId | null => {
  const available = archetype.preferredServices.filter((service) => state.unlockedServices.includes(service));
  if (!available.length) return null;
  return available[Math.floor(rand(seed) * available.length)] ?? available[0];
};

export interface DemandFlowBuild {
  inboundLeads: number;
  referralLeads: number;
  newPatients: PersistentPatient[];
  bookedVisits: PatientVisit[];
  returningBooked: number;
  rebookedFromExisting: number;
  lostUnbooked: number;
  lostServiceMismatch: number;
}

export const buildDailyPatientFlow = (state: GameState, day: number, leads: number, bookingRate: number): DemandFlowBuild => {
  const bookedVisits: PatientVisit[] = [];
  const newPatients: PersistentPatient[] = [];
  let lostUnbooked = 0;
  let lostServiceMismatch = 0;

  const returningPatients = state.patients.filter((patient) => patient.futureBookings.includes(day) && patient.lifecycleState !== 'droppedOut');

  for (const patient of returningPatients) {
    bookedVisits.push({
      id: uid(),
      patientId: patient.id,
      archetype: patient.archetype,
      service: patient.nextRecommendedService,
      complexity: archetypeById(patient.archetype).complexity,
      insured: patient.payerType === 'insured',
      status: 'waiting'
    });
  }

  const referralLeads = state.patients.reduce((sum, patient, index) => {
    if (patient.lifecycleState !== 'discharged' || patient.lastTransitionDay !== day - 1) return sum;
    const roll = rand(state.seed + day * 211 + index * 31);
    return sum + (roll < patient.referralLikelihood ? 1 : 0);
  }, 0);

  const totalNewLeads = Math.max(0, leads + referralLeads);

  for (let i = 0; i < totalNewLeads; i += 1) {
    const seed = state.seed + day * 97 + i * 17;
    if (rand(seed + 99) > bookingRate) {
      lostUnbooked += 1;
      continue;
    }

    const archetype = weightedArchetype(seed, state);
    const nextService = pickService(state, archetype, seed + 3);
    if (!nextService || !SERVICES.find((service) => service.id === nextService)) {
      lostServiceMismatch += 1;
      continue;
    }

    const patientId = uid();
    const insured = rand(seed + 7) > BALANCE.uninsuredThreshold;
    const expectedVisits = Math.max(2, Math.round(archetype.expectedVisits * (0.8 + rand(seed + 5) * 0.5)));
    const patient: PersistentPatient = {
      id: patientId,
      archetype: archetype.id,
      payerType: insured ? 'insured' : 'selfPay',
      lifecycleState: 'lead',
      clinicalProgress: 0,
      satisfaction: clamp(0.58 + archetype.patience * 0.25, 0.2, 0.95),
      patience: archetype.patience,
      adherence: archetype.adherence,
      noShowPropensity: archetype.noShowChance,
      referralLikelihood: clamp(archetype.referralValue * 0.5, 0.05, 0.8),
      expectedTotalVisits: expectedVisits,
      remainingVisits: expectedVisits,
      nextRecommendedService: nextService,
      futureBookings: [day],
      lastTransitionDay: day
    };

    newPatients.push(patient);
    bookedVisits.push({
      id: uid(),
      patientId,
      archetype: archetype.id,
      service: nextService,
      complexity: archetype.complexity,
      insured,
      status: 'waiting'
    });
  }

  return {
    inboundLeads: leads,
    referralLeads,
    newPatients,
    bookedVisits,
    returningBooked: returningPatients.length,
    rebookedFromExisting: returningPatients.length,
    lostUnbooked,
    lostServiceMismatch
  };
};

export interface VisitJourneyEvent {
  patientId: string;
  result: 'completed' | 'noShow' | 'cancelled' | 'unserved';
  wait: number;
  outcome: number;
  satisfaction: number;
  service: ServiceId;
}

export const updatePatientJourneys = (state: GameState, day: number, events: VisitJourneyEvent[]): PersistentPatient[] => {
  const byPatient = new Map(events.map((event) => [event.patientId, event]));
  return state.patients.map((patient, index) => {
    const scheduledToday = patient.futureBookings.includes(day);
    const event = byPatient.get(patient.id);
    const bookings = patient.futureBookings.filter((bookingDay) => bookingDay !== day);

    if (!scheduledToday || !event) {
      if (scheduledToday && !event && patient.lifecycleState !== 'droppedOut') {
        return { ...patient, lifecycleState: 'waiting', futureBookings: bookings, lastTransitionDay: day };
      }
      return { ...patient, futureBookings: bookings };
    }

    if (event.result === 'noShow' || event.result === 'cancelled' || event.result === 'unserved') {
      const badExperience = event.result === 'unserved' ? 0.2 : 0.1;
      const updatedSatisfaction = clamp(patient.satisfaction - (0.08 + badExperience), 0, 1);
      const dropoutRisk = clamp((1 - updatedSatisfaction) * 0.6 + patient.noShowPropensity * 0.5, 0.05, 0.95);
      const droppedOut = rand(state.seed + day * 197 + index * 13) < dropoutRisk;
      const rebook = !droppedOut && rand(state.seed + day * 131 + index * 9) < clamp(patient.patience * 0.75, 0.1, 0.9);
      const nextDay = day + 1 + Math.floor(rand(state.seed + day * 23 + index * 7) * 3);
      return {
        ...patient,
        satisfaction: updatedSatisfaction,
        lifecycleState: droppedOut ? 'droppedOut' : rebook ? 'booked' : 'needsFollowUp',
        futureBookings: rebook ? [...bookings, nextDay] : bookings,
        lastTransitionDay: day
      };
    }

    const remainingVisits = Math.max(0, patient.remainingVisits - 1);
    const progressGain = clamp(event.outcome * patient.adherence * 0.35, 0.02, 0.4);
    const clinicalProgress = clamp(patient.clinicalProgress + progressGain, 0, 1);
    const updatedSatisfaction = clamp(patient.satisfaction * 0.7 + event.satisfaction * 0.3, 0, 1);
    const rebookChance = clamp(updatedSatisfaction * 0.45 + event.outcome * 0.35 + patient.adherence * 0.2 - event.wait / 250, 0.02, 0.95);
    const shouldDischarge = remainingVisits <= 0 || clinicalProgress >= 0.96;
    const shouldRebook = !shouldDischarge && rand(state.seed + day * 149 + index * 19) < rebookChance;
    const nextService = shouldDischarge ? patient.nextRecommendedService : (patient.nextRecommendedService === 'initialAssessment' ? 'followUp' : patient.nextRecommendedService);
    const nextDay = day + 2 + Math.floor(rand(state.seed + day * 17 + index * 5) * 4);

    return {
      ...patient,
      lifecycleState: shouldDischarge ? 'discharged' : shouldRebook ? 'booked' : 'needsFollowUp',
      clinicalProgress,
      satisfaction: updatedSatisfaction,
      referralLikelihood: clamp(patient.referralLikelihood * 0.6 + updatedSatisfaction * 0.3 + event.outcome * 0.25, 0.02, 0.95),
      remainingVisits,
      nextRecommendedService: nextService,
      futureBookings: shouldRebook ? [...bookings, nextDay] : bookings,
      lastVisitDay: day,
      lastTransitionDay: day
    };
  });
};
