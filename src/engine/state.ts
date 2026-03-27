import { SAVE_VERSION } from '../data/content';
import { GameMode, GameState, StaffMember, StaffRoleId } from '../types/game';
import { uid } from './utils';

const makeStaff = (role: StaffRoleId, name: string, wage: number): StaffMember => ({
  uid: uid(),
  role,
  name,
  speed: role === 'specialist' ? 0.88 : role === 'physio' ? 0.74 : 0.67,
  quality: role === 'specialist' ? 0.9 : role === 'physio' ? 0.76 : role === 'assistant' ? 0.56 : 0.45,
  documentation: role === 'frontDesk' ? 0.88 : 0.64,
  communication: role === 'frontDesk' ? 0.82 : 0.68,
  fatigueResistance: role === 'assistant' ? 0.72 : 0.63,
  wage,
  morale: 72,
  fatigue: 18,
  scheduled: true
});

export const createInitialState = (mode: GameMode): GameState => ({
  version: SAVE_VERSION,
  seed: Date.now() % 100000,
  mode,
  scenarioId: 'default',
  difficultyPreset: mode === 'sandbox' ? 'relaxed' : 'standard',
  day: 1,
  week: 1,
  cash: mode === 'sandbox' ? 50000 : 22000,
  reputation: mode === 'sandbox' ? 50 : 45,
  referrals: mode === 'sandbox' ? 18 : 14,
  rent: mode === 'sandbox' ? 760 : 820,
  equipmentCost: mode === 'sandbox' ? 120 : 150,
  payrollDue: 0,
  clinicSize: 4,
  maxClinicSize: 6,
  speed: 0,
  paused: true,
  gameOver: false,
  gameWon: false,
  selectedTab: 'overview',
  unlockedUpgrades: [],
  unlockedRooms: ['reception', 'waiting', 'treatment', 'gym'],
  unlockedServices: ['initialAssessment', 'followUp', 'exerciseSession', 'groupClass', 'postOpPathway'],
  staff: [
    makeStaff('physio', 'Alex Morgan', 390),
    makeStaff('frontDesk', 'Jordan Lee', 170),
    makeStaff('assistant', 'Sam Patel', 205)
  ],
  rooms: [
    { id: uid(), type: 'reception', level: 1, x: 0, y: 0 },
    { id: uid(), type: 'waiting', level: 1, x: 1, y: 0 },
    { id: uid(), type: 'treatment', level: 1, x: 0, y: 1 },
    { id: uid(), type: 'gym', level: 1, x: 1, y: 1 }
  ],
  patientQueue: [],
  demandSnapshot: {
    inboundLeads: 0,
    bookedVisits: 0,
    utilization: 0,
    lostDemand: {
      unbooked: 0,
      serviceMismatch: 0,
      capacity: 0,
      cancellations: 0,
      noShows: 0
    }
  },
  weeklyLedger: {
    revenue: 0,
    variableCosts: 0,
    attendedVisits: 0,
    noShows: 0
  },
  operationalModifiers: {
    leadMultiplier: 1,
    bookingShift: 0,
    cancellationShift: 0,
    noShowShift: 0,
    variableCostShift: 0
  },
  backlogDocs: 0,
  fatigueIndex: 0.2,
  latestSummary: undefined,
  eventLog: ['Welcome to Physiotherapy Clinic Tycoon.'],
  campaignGoal: {
    targetWeek: 14,
    targetReputation: 75,
    targetCash: 50000
  },
  settings: {
    soundEnabled: true,
    ambientEnabled: false,
    showTutorialHints: true
  }
});
