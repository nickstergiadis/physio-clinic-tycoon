export type GameMode = 'campaign' | 'sandbox';
export type Screen = 'menu' | 'newGame' | 'loadGame' | 'tutorial' | 'settings' | 'inGame';
export type GameSpeed = 0 | 1 | 2 | 3;
export type DifficultyPresetId = 'relaxed' | 'standard' | 'hardcore';
export type ScenarioId = 'community_rebuild' | 'sports_performance' | 'insurance_crunch';

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
export type BuildItemCategory = 'waiting' | 'wayfinding' | 'frontDesk' | 'decor' | 'rehab' | 'admin' | 'breakroom';
export type BuildItemId =
  | 'waiting_chairs'
  | 'wayfinding_sign'
  | 'front_desk_pod'
  | 'decor_plant'
  | 'rehab_station'
  | 'storage_wall'
  | 'breakroom_corner';
export type StaffTraitId = 'steady' | 'empathetic' | 'fastLearner' | 'resilient' | 'specialistMindset';
export type ShiftType = 'off' | 'half' | 'full';
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

export type BookingPolicy = 'conservative' | 'balanced' | 'aggressive';

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
  trait: StaffTraitId;
  specialtyFocus: PatientArchetypeId;
  assignedRoom: RoomTypeId | 'flex';
  speed: number;
  quality: number;
  documentation: number;
  communication: number;
  fatigueResistance: number;
  wage: number;
  morale: number;
  fatigue: number;
  scheduled: boolean;
  shift: ShiftType;
  level: number;
  xp: number;
  trainingDaysRemaining: number;
  certifications: ServiceId[];
  burnoutRisk: number;
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
  equipmentLevel: number;
  focusService: ServiceId | 'general';
  x: number;
  y: number;
}

export interface BuildItemDefinition {
  id: BuildItemId;
  name: string;
  category: BuildItemCategory;
  cost: number;
  maintenance: number;
  description: string;
  placement: {
    roomTypes?: RoomTypeId[];
    allowOnPath?: boolean;
    allowOnEmpty?: boolean;
    requiresAdjacentRoomTypes?: RoomTypeId[];
    maxPerTile?: number;
  };
  effects: {
    waitingComfort?: number;
    wayfinding?: number;
    adminEfficiency?: number;
    treatmentQuality?: number;
    moraleRecovery?: number;
  };
}

export interface PlacedBuildItem {
  id: string;
  itemId: BuildItemId;
  x: number;
  y: number;
}

export interface ServiceDefinition {
  id: ServiceId;
  name: string;
  duration: number;
  schedulingNeed: 'low' | 'medium' | 'high';
  baseRevenue: number;
  qualityImpact: number;
  fatigueImpact: number;
  adminLoad: number;
  requiredRoom: RoomTypeId;
  preferredSpecialties: PatientArchetypeId[];
  facilitySensitivity: number;
  equipmentSensitivity: number;
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
  noShowShift: number;
  cancellationShift: number;
  reputationDecay: number;
  loanInterestMultiplier: number;
}

export type ObjectiveMetric =
  | 'cash'
  | 'reputation'
  | 'districtTier'
  | 'attendedVisits'
  | 'avgOutcome'
  | 'serviceDiversity'
  | 'loanCleared';

export interface ScenarioObjective {
  id: string;
  label: string;
  metric: ObjectiveMetric;
  target: number;
  deadlineWeek: number;
  optional?: boolean;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  description: string;
  startCash: number;
  startReputation: number;
  startReferrals: number;
  rent: number;
  equipmentCost: number;
  startingLoanOffer: number;
  demandMixBias: Partial<Record<PatientArchetypeId, number>>;
  objectives: ScenarioObjective[];
  failure: {
    maxDebt: number;
    minReputation: number;
    stressWeek: number;
  };
}

export interface ObjectiveProgress {
  objectiveId: string;
  completed: boolean;
  completedWeek?: number;
}

export interface LoanState {
  principal: number;
  interestRate: number;
  termWeeks: number;
  weeksRemaining: number;
  weeklyPayment: number;
}

export interface ReputationTier {
  id: 'local' | 'district' | 'city';
  threshold: number;
  grant: number;
  unlockServices: ServiceId[];
  unlockUpgrades: string[];
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

export interface IncidentEffect {
  cash?: number;
  reputation?: number;
  referrals?: number;
  backlogDocs?: number;
  equipmentCost?: number;
  rent?: number;
  moraleShift?: number;
  fatigueShift?: number;
  dailyCash?: number;
  dailyReputation?: number;
  dailyReferrals?: number;
  dailyBacklogDocs?: number;
  dailyMoraleShift?: number;
  dailyFatigueShift?: number;
  modifierPatch?: Partial<GameState['operationalModifiers']>;
}

export interface IncidentDecisionOption {
  id: string;
  label: string;
  description: string;
  effects?: IncidentEffect;
  addOngoingEffects?: IncidentEffect;
}

export interface ActiveIncident {
  id: string;
  chainId: string;
  name: string;
  description: string;
  startedDay: number;
  daysRemaining: number;
  stage: 'trigger' | 'ongoing' | 'resolution';
  effectsSummary: string;
  ongoingEffects: IncidentEffect;
  pendingDecision?: {
    stage: 'trigger' | 'resolution';
    prompt: string;
    options: IncidentDecisionOption[];
    defaultOptionId: string;
  };
}


export interface GridCoord {
  x: number;
  y: number;
}

export interface LayoutFlowSummary {
  avgTravelTiles: number;
  waitPenaltyMinutes: number;
  throughputMultiplier: number;
  satisfactionPenalty: number;
  staffEfficiencyMultiplier: number;
  congestionIndex: number;
  warnings: string[];
  unreachableRoutes: number;
  heatmap: Array<GridCoord & { load: number }>;
}

export interface PatientVisit {
  id: string;
  patientId: string;
  archetype: PatientArchetypeId;
  service: ServiceId;
  complexity: number;
  insured: boolean;
  scheduledSlot: number;
  scheduledMinute: number;
  expectedDuration: number;
  arrivalOffsetMinutes: number;
  status: 'waiting' | 'completed' | 'noShow' | 'late';
}

export interface ScheduleMetrics {
  policy: BookingPolicy;
  slotsUsed: number;
  totalSlots: number;
  queueLengthPeak: number;
  missedAppointments: number;
  lateArrivals: number;
  earlyArrivals: number;
  overruns: number;
  spilloverMinutes: number;
  unusedGaps: number;
}

export type PatientLifecycleState = 'lead' | 'booked' | 'arrived' | 'waiting' | 'treated' | 'needsFollowUp' | 'discharged' | 'droppedOut';

export interface PersistentPatient {
  id: string;
  archetype: PatientArchetypeId;
  payerType: 'insured' | 'selfPay';
  lifecycleState: PatientLifecycleState;
  clinicalProgress: number;
  satisfaction: number;
  patience: number;
  adherence: number;
  noShowPropensity: number;
  referralLikelihood: number;
  expectedTotalVisits: number;
  remainingVisits: number;
  nextRecommendedService: ServiceId;
  futureBookings: number[];
  lastVisitDay?: number;
  lastTransitionDay?: number;
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
  bottlenecks: {
    staffing: number;
    room: number;
    equipment: number;
    burnout: number;
  };
  patientThoughts: ThoughtInsight[];
  staffThoughts: ThoughtInsight[];
  topComplaints: DiagnosticCategory[];
  topPositives: DiagnosticCategory[];
  serviceLinePerformance: ServiceLineInsight[];
  notes: string[];
  layoutFlow?: LayoutFlowSummary;
  schedule: ScheduleMetrics;
}

export type InsightSeverity = 'low' | 'medium' | 'high';

export interface ThoughtInsight {
  id: string;
  actor: 'patient' | 'staff';
  category: string;
  severity: InsightSeverity;
  text: string;
  cause: string;
  metric: number;
  relatedService?: ServiceId;
}

export interface DiagnosticCategory {
  category: string;
  label: string;
  score: number;
  severity: InsightSeverity;
  reason: string;
  relatedService?: ServiceId;
}

export interface ServiceLineInsight {
  serviceId: ServiceId;
  label: string;
  profit: number;
  marginPct: number;
  attended: number;
  failures: number;
  avgOutcome: number;
  status: 'strong' | 'watch' | 'critical';
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
  scenarioId: ScenarioId;
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
  bookingPolicy: BookingPolicy;
  unlockedUpgrades: string[];
  unlockedRooms: RoomTypeId[];
  unlockedServices: ServiceId[];
  staff: StaffMember[];
  rooms: RoomInstance[];
  placedItems: PlacedBuildItem[];
  pathTiles: GridCoord[];
  patientQueue: PatientVisit[];
  patients: PersistentPatient[];
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
  latestSchedule: ScheduleMetrics;
  activeIncidents: ActiveIncident[];
  eventLog: string[];
  campaignGoal: {
    targetWeek: number;
    targetReputation: number;
    targetCash: number;
  };
  objectiveProgress: ObjectiveProgress[];
  districtTier: number;
  unlockedTierRewards: string[];
  loan: LoanState | null;
  lifetimeStats: {
    attendedVisits: number;
    avgOutcomeRolling: number;
  };
  settings: SettingsState;
  dev?: {
    highNoShowMode: boolean;
  };
}
