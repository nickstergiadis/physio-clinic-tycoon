export type GameMode = 'campaign' | 'sandbox';
export type Screen = 'menu' | 'newGame' | 'loadGame' | 'tutorial' | 'settings' | 'inGame';
export type GameSpeed = 0 | 1 | 2 | 3;
export type DifficultyPresetId = 'relaxed' | 'standard' | 'hardcore';

export type PatientArchetypeId =
  | 'athlete'
  | 'officeWorker'
  | 'olderAdult'
  | 'postOp'
  | 'chronicPain'
  | 'vestibular'
  | 'workersComp'
  | 'pediatric';

export type StaffRoleId = 'physio' | 'assistant' | 'frontDesk' | 'specialist';
export type RoomTypeId = 'reception' | 'treatment' | 'gym' | 'waiting' | 'vestibularLab' | 'hydro';
export type ServiceId =
  | 'initialAssessment'
  | 'followUp'
  | 'exerciseSession'
  | 'groupClass'
  | 'returnToSport'
  | 'vestibularProgram'
  | 'postOpPathway'
  | 'chronicPainProgram'
  | 'premiumAssessment';

export interface PatientArchetype {
  id: PatientArchetypeId;
  name: string;
  complexity: number;
  expectedVisits: number;
  patience: number;
  satisfactionSensitivity: number;
  reimbursement: number;
  adminBurden: number;
  adherence: number;
  noShowChance: number;
  improvementSpeed: number;
  referralValue: number;
  preferredServices: ServiceId[];
}

export interface StaffTemplate {
  id: StaffRoleId;
  name: string;
  baseWage: number;
  hireCost: number;
  speed: number;
  quality: number;
  documentation: number;
  communication: number;
  fatigueResistance: number;
  specialtyBonus: Partial<Record<PatientArchetypeId, number>>;
}

export interface StaffMember {
  uid: string;
  role: StaffRoleId;
  name: string;
  speed: number;
  quality: number;
  documentation: number;
  communication: number;
  fatigueResistance: number;
  wage: number;
  morale: number;
  fatigue: number;
  scheduled: boolean;
}

export interface RoomDefinition {
  id: RoomTypeId;
  name: string;
  cost: number;
  maintenance: number;
  throughputBonus: number;
  satisfactionBonus: number;
  requiredUpgrade?: string;
}

export interface RoomInstance {
  id: string;
  type: RoomTypeId;
  level: number;
  x: number;
  y: number;
}

export interface ServiceDefinition {
  id: ServiceId;
  name: string;
  duration: number;
  baseRevenue: number;
  qualityImpact: number;
  fatigueImpact: number;
  adminLoad: number;
  requiredRoom: RoomTypeId;
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  cost: number;
  description: string;
  effects: {
    referralMult?: number;
    qualityBonus?: number;
    adminReduction?: number;
    noShowReduction?: number;
    maxClinicSize?: number;
    moraleGain?: number;
    premiumPricing?: number;
    unlockRooms?: RoomTypeId[];
    unlockServices?: ServiceId[];
  };
}

export interface DifficultyPreset {
  id: DifficultyPresetId;
  name: string;
  demandMultiplier: number;
  revenueMultiplier: number;
  expenseMultiplier: number;
}

export interface SimulationBalance {
  minDailyDemand: number;
  maxDailyDemand: number;
  referralsToDemand: number;
  reputationToDemand: number;
  uninsuredThreshold: number;
  capacityPerStaff: number;
  fatigueCapacityDivisor: number;
  roomThroughputUnit: number;
  overcrowdThreshold: number;
  overcrowdPenalty: number;
  baseNoShowBuffer: number;
  minNoShowChance: number;
  maxNoShowChance: number;
  comfortCapacityRatio: number;
  waitUnitMinutes: number;
  qualityFatigueDivisor: number;
  fatigueServiceScale: number;
  fatigueResistanceWeight: number;
  moraleGainScaling: number;
  insuredRevenueMultiplier: number;
  selfPayRevenueMultiplier: number;
  adminReductionWeight: number;
  documentationThroughput: number;
  docsPenaltyThreshold: number;
  docsPenaltyUnit: number;
  dailyFatigueRecovery: number;
  lowResistanceRecoveryPenalty: number;
}

export interface EventCard {
  id: string;
  name: string;
  description: string;
  chance: number;
  apply: (state: GameState) => GameState;
}

export interface PatientVisit {
  id: string;
  archetype: PatientArchetypeId;
  service: ServiceId;
  complexity: number;
  insured: boolean;
  status: 'waiting' | 'completed' | 'noShow' | 'late';
}

export interface DaySummary {
  day: number;
  revenue: number;
  expenses: number;
  profit: number;
  fixedCosts: number;
  variableCosts: number;
  daysUntilWeeklyCosts: number;
  weeklyCostsDueNext: number;
  inboundLeads: number;
  bookedVisits: number;
  attendedVisits: number;
  utilization: number;
  lostDemand: {
    unbooked: number;
    serviceMismatch: number;
    capacity: number;
    cancellations: number;
    noShows: number;
  };
  treated: number;
  noShows: number;
  avgOutcome: number;
  avgWait: number;
  notes: string[];
}

export interface WeeklyLedger {
  revenue: number;
  variableCosts: number;
  attendedVisits: number;
  noShows: number;
}

export interface SaveSlot {
  id: string;
  label: string;
  timestamp: number;
  version: number;
  state: GameState;
}

export interface SettingsState {
  soundEnabled: boolean;
  ambientEnabled: boolean;
  showTutorialHints: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  mode: GameMode;
  scenarioId: string;
  difficultyPreset: DifficultyPresetId;
  day: number;
  week: number;
  cash: number;
  reputation: number;
  referrals: number;
  rent: number;
  equipmentCost: number;
  payrollDue: number;
  clinicSize: number;
  maxClinicSize: number;
  speed: GameSpeed;
  paused: boolean;
  gameOver: boolean;
  gameWon: boolean;
  selectedTab: 'overview' | 'build' | 'staff' | 'patients' | 'finance' | 'upgrades';
  unlockedUpgrades: string[];
  unlockedRooms: RoomTypeId[];
  unlockedServices: ServiceId[];
  staff: StaffMember[];
  rooms: RoomInstance[];
  patientQueue: PatientVisit[];
  demandSnapshot: {
    inboundLeads: number;
    bookedVisits: number;
    utilization: number;
    lostDemand: {
      unbooked: number;
      serviceMismatch: number;
      capacity: number;
      cancellations: number;
      noShows: number;
    };
  };
  weeklyLedger: WeeklyLedger;
  operationalModifiers: {
    leadMultiplier: number;
    bookingShift: number;
    cancellationShift: number;
    noShowShift: number;
    variableCostShift: number;
    note?: string;
  };
  backlogDocs: number;
  fatigueIndex: number;
  latestSummary?: DaySummary;
  eventLog: string[];
  campaignGoal: {
    targetWeek: number;
    targetReputation: number;
    targetCash: number;
  };
  settings: SettingsState;
}
