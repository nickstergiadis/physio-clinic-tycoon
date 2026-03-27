import { PatientVisit } from '../types/game';

export const markCompletedVisit = (visit: PatientVisit): PatientVisit => ({ ...visit, status: 'completed' });

export const markNoShowVisit = (visit: PatientVisit): PatientVisit => ({ ...visit, status: 'noShow' });

export const markWaitingVisit = (visit: PatientVisit): PatientVisit => ({ ...visit, status: 'waiting' });
