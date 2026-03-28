import { DEFAULT_SCENARIO_ID, SAVE_VERSION } from '../data/content';
import { DifficultyPresetId, GameMode, GameState, PatientArchetypeId, ScenarioId, StaffMember, StaffRoleId, StaffTraitId } from '../types/game';
import { getScenario } from './campaign';
import { uid } from './utils';
import { baseScheduleMetrics } from './queueManagement';

const makeStaff = (role: StaffRoleId, name: string, wage: number, trait: StaffTraitId, specialtyFocus: PatientArchetypeId): StaffMember => ({
  uid: uid(),
  role,
  name,
  trait,
  specialtyFocus,
  assignedRoom: role === 'frontDesk' ? 'reception' : 'flex',
  speed: role === 'specialist' ? 0.88 : role === 'physio' ? 0.74 : 0.67,
  quality: role === 'specialist' ? 0.9 : role === 'physio' ? 0.76 : role === 'assistant' ? 0.56 : 0.45,
  documentation: role === 'frontDesk' ? 0.88 : 0.64,
  communication: role === 'frontDesk' ? 0.82 : 0.68,
  fatigueResistance: role === 'assistant' ? 0.72 : 0.63,
  wage,
  morale: 72,
  fatigue: 18,
  scheduled: true,
  shift: 'full',
  level: 1,
  xp: 0,
  trainingDaysRemaining: 0,
  certifications: role === 'specialist' ? ['vestibularProgram'] : ['followUp'],
  burnoutRisk: 0.12
});

export const createInitialState = (mode: GameMode, scenarioId: ScenarioId = DEFAULT_SCENARIO_ID, difficultyPreset?: DifficultyPresetId): GameState => {
  const scenario = getScenario(scenarioId);
  const resolvedDifficulty = difficultyPreset ?? (mode === 'sandbox' ? 'relaxed' : 'standard');

  return ({
  version: SAVE_VERSION,
  seed: Date.now() % 100000,
  mode,
  scenarioId,
  difficultyPreset: resolvedDifficulty,
  day: 1,
  week: 1,
  cash: mode === 'sandbox' ? 50000 : scenario.startCash,
  reputation: mode === 'sandbox' ? 50 : scenario.startReputation,
  referrals: mode === 'sandbox' ? 18 : scenario.startReferrals,
  rent: mode === 'sandbox' ? 760 : scenario.rent,
  equipmentCost: mode === 'sandbox' ? 120 : scenario.equipmentCost,
  payrollDue: 0,
  clinicSize: 4,
  maxClinicSize: 6,
  speed: 0,
  paused: true,
  gameOver: false,
  gameWon: false,
  selectedTab: 'overview',
  bookingPolicy: 'balanced',
  unlockedUpgrades: [],
  unlockedRooms: ['reception', 'waiting', 'treatment', 'gym'],
  unlockedServices: ['initialAssessment', 'followUp', 'exerciseSession', 'groupClass', 'postOpPathway'],
  staff: [
    makeStaff('physio', 'Alex Morgan', 360, 'steady', 'postOp'),
    makeStaff('frontDesk', 'Jordan Lee', 170, 'empathetic', 'workersComp'),
    makeStaff('assistant', 'Sam Patel', 205, 'resilient', 'olderAdult')
  ],
  rooms: [
    { id: uid(), type: 'reception', level: 1, equipmentLevel: 1, focusService: 'general', x: 0, y: 0 },
    { id: uid(), type: 'waiting', level: 1, equipmentLevel: 1, focusService: 'general', x: 1, y: 0 },
    { id: uid(), type: 'treatment', level: 1, equipmentLevel: 1, focusService: 'initialAssessment', x: 0, y: 1 },
    { id: uid(), type: 'gym', level: 1, equipmentLevel: 1, focusService: 'exerciseSession', x: 1, y: 1 }
  ],
  placedItems: [
    { id: uid(), itemId: 'waiting_chairs', x: 1, y: 0 },
    { id: uid(), itemId: 'front_desk_pod', x: 0, y: 0 },
    { id: uid(), itemId: 'wayfinding_sign', x: 2, y: 0 }
  ],
  pathTiles: [
    { x: 2, y: 0 },
    { x: 2, y: 1 }
  ],
  patientQueue: [],
  patients: [],
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
  latestSchedule: baseScheduleMetrics('balanced'),
  activeIncidents: [],
  eventLog: ['Welcome to Physiotherapy Clinic Tycoon.'],
  campaignGoal: {
    targetWeek: mode === 'sandbox' ? 0 : Math.max(...scenario.objectives.map((objective) => objective.deadlineWeek)),
    targetReputation: mode === 'sandbox' ? 0 : 70,
    targetCash: mode === 'sandbox' ? 0 : 50000
  },
  objectiveProgress: mode === 'sandbox' ? [] : scenario.objectives.map((objective) => ({ objectiveId: objective.id, completed: false })),
  districtTier: 1,
  unlockedTierRewards: ['tier_local'],
  loan: null,
  lifetimeStats: {
    attendedVisits: 0,
    avgOutcomeRolling: 0
  },
  settings: {
    soundEnabled: true,
    ambientEnabled: false,
    showTutorialHints: true
  },
  dev: {
    highNoShowMode: false
  }
  });
};
