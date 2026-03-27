import {
  DifficultyPreset,
  PatientArchetype,
  RoomDefinition,
  SimulationBalance,
  ServiceDefinition,
  StaffTemplate,
  UpgradeDefinition
} from '../types/game';

export const SAVE_VERSION = 2;

export const PATIENT_ARCHETYPES: PatientArchetype[] = [
  {
    id: 'athlete',
    name: 'Athlete',
    complexity: 0.55,
    expectedVisits: 7,
    patience: 0.8,
    satisfactionSensitivity: 0.75,
    reimbursement: 180,
    adminBurden: 0.3,
    adherence: 0.85,
    noShowChance: 0.08,
    improvementSpeed: 0.8,
    referralValue: 0.75,
    preferredServices: ['initialAssessment', 'returnToSport', 'exerciseSession']
  },
  {
    id: 'officeWorker',
    name: 'Office Worker',
    complexity: 0.45,
    expectedVisits: 6,
    patience: 0.6,
    satisfactionSensitivity: 0.7,
    reimbursement: 135,
    adminBurden: 0.25,
    adherence: 0.62,
    noShowChance: 0.12,
    improvementSpeed: 0.55,
    referralValue: 0.5,
    preferredServices: ['initialAssessment', 'followUp', 'exerciseSession']
  },
  {
    id: 'olderAdult',
    name: 'Older Adult',
    complexity: 0.6,
    expectedVisits: 8,
    patience: 0.7,
    satisfactionSensitivity: 0.65,
    reimbursement: 165,
    adminBurden: 0.35,
    adherence: 0.7,
    noShowChance: 0.1,
    improvementSpeed: 0.5,
    referralValue: 0.55,
    preferredServices: ['initialAssessment', 'followUp', 'groupClass']
  },
  {
    id: 'postOp',
    name: 'Post-op',
    complexity: 0.85,
    expectedVisits: 12,
    patience: 0.55,
    satisfactionSensitivity: 0.85,
    reimbursement: 240,
    adminBurden: 0.55,
    adherence: 0.73,
    noShowChance: 0.09,
    improvementSpeed: 0.6,
    referralValue: 0.82,
    preferredServices: ['initialAssessment', 'postOpPathway', 'followUp']
  },
  {
    id: 'chronicPain',
    name: 'Chronic Pain',
    complexity: 0.92,
    expectedVisits: 14,
    patience: 0.48,
    satisfactionSensitivity: 0.9,
    reimbursement: 210,
    adminBurden: 0.6,
    adherence: 0.45,
    noShowChance: 0.18,
    improvementSpeed: 0.35,
    referralValue: 0.7,
    preferredServices: ['initialAssessment', 'chronicPainProgram', 'groupClass']
  },
  {
    id: 'vestibular',
    name: 'Vestibular',
    complexity: 0.78,
    expectedVisits: 9,
    patience: 0.66,
    satisfactionSensitivity: 0.8,
    reimbursement: 230,
    adminBurden: 0.4,
    adherence: 0.64,
    noShowChance: 0.14,
    improvementSpeed: 0.6,
    referralValue: 0.84,
    preferredServices: ['initialAssessment', 'vestibularProgram', 'followUp']
  },
  {
    id: 'workersComp',
    name: 'Workers Comp / Insurer',
    complexity: 0.68,
    expectedVisits: 10,
    patience: 0.5,
    satisfactionSensitivity: 0.6,
    reimbursement: 190,
    adminBurden: 0.88,
    adherence: 0.57,
    noShowChance: 0.15,
    improvementSpeed: 0.48,
    referralValue: 0.68,
    preferredServices: ['initialAssessment', 'followUp', 'postOpPathway']
  },
  {
    id: 'pediatric',
    name: 'Pediatric (Parent-managed)',
    complexity: 0.58,
    expectedVisits: 8,
    patience: 0.52,
    satisfactionSensitivity: 0.78,
    reimbursement: 175,
    adminBurden: 0.45,
    adherence: 0.67,
    noShowChance: 0.16,
    improvementSpeed: 0.62,
    referralValue: 0.77,
    preferredServices: ['initialAssessment', 'exerciseSession', 'groupClass']
  }
];

export const STAFF_TEMPLATES: StaffTemplate[] = [
  {
    id: 'physio',
    name: 'Physiotherapist',
    baseWage: 390,
    hireCost: 2200,
    speed: 0.7,
    quality: 0.78,
    documentation: 0.62,
    communication: 0.7,
    fatigueResistance: 0.65,
    specialtyBonus: { athlete: 0.08, postOp: 0.1 }
  },
  {
    id: 'assistant',
    name: 'Rehab Assistant',
    baseWage: 205,
    hireCost: 1250,
    speed: 0.75,
    quality: 0.52,
    documentation: 0.5,
    communication: 0.66,
    fatigueResistance: 0.72,
    specialtyBonus: { officeWorker: 0.06, olderAdult: 0.08 }
  },
  {
    id: 'frontDesk',
    name: 'Front Desk Admin',
    baseWage: 170,
    hireCost: 1000,
    speed: 0.7,
    quality: 0.45,
    documentation: 0.9,
    communication: 0.82,
    fatigueResistance: 0.6,
    specialtyBonus: { workersComp: 0.12, chronicPain: 0.05 }
  },
  {
    id: 'specialist',
    name: 'Specialist Contractor',
    baseWage: 560,
    hireCost: 3600,
    speed: 0.68,
    quality: 0.92,
    documentation: 0.75,
    communication: 0.74,
    fatigueResistance: 0.58,
    specialtyBonus: { vestibular: 0.2, chronicPain: 0.14, athlete: 0.12 }
  }
];

export const ROOM_DEFS: RoomDefinition[] = [
  { id: 'reception', name: 'Reception', cost: 1600, maintenance: 45, throughputBonus: 0.09, satisfactionBonus: 0.04 },
  { id: 'waiting', name: 'Waiting Area', cost: 780, maintenance: 20, throughputBonus: 0.05, satisfactionBonus: 0.08 },
  { id: 'treatment', name: 'Treatment Room', cost: 2050, maintenance: 62, throughputBonus: 0.16, satisfactionBonus: 0.05 },
  { id: 'gym', name: 'Rehab Gym', cost: 2550, maintenance: 75, throughputBonus: 0.18, satisfactionBonus: 0.07 },
  {
    id: 'vestibularLab',
    name: 'Vestibular Lab',
    cost: 4600,
    maintenance: 108,
    throughputBonus: 0.11,
    satisfactionBonus: 0.1,
    requiredUpgrade: 'vestibular_suite'
  },
  {
    id: 'hydro',
    name: 'Hydro Therapy Room',
    cost: 6100,
    maintenance: 136,
    throughputBonus: 0.12,
    satisfactionBonus: 0.12,
    requiredUpgrade: 'hydro_program'
  }
];

export const SERVICES: ServiceDefinition[] = [
  { id: 'initialAssessment', name: 'Initial Assessment', duration: 45, baseRevenue: 225, qualityImpact: 0.1, fatigueImpact: 0.08, adminLoad: 1.05, requiredRoom: 'treatment' },
  { id: 'followUp', name: 'Follow-up Session', duration: 30, baseRevenue: 132, qualityImpact: 0.06, fatigueImpact: 0.055, adminLoad: 0.72, requiredRoom: 'treatment' },
  { id: 'exerciseSession', name: 'Exercise Session', duration: 35, baseRevenue: 144, qualityImpact: 0.07, fatigueImpact: 0.06, adminLoad: 0.55, requiredRoom: 'gym' },
  { id: 'groupClass', name: 'Group Class', duration: 50, baseRevenue: 338, qualityImpact: 0.05, fatigueImpact: 0.045, adminLoad: 1.2, requiredRoom: 'gym' },
  { id: 'returnToSport', name: 'Return-to-Sport Package', duration: 55, baseRevenue: 306, qualityImpact: 0.14, fatigueImpact: 0.095, adminLoad: 1.05, requiredRoom: 'gym' },
  { id: 'vestibularProgram', name: 'Vestibular Program', duration: 40, baseRevenue: 280, qualityImpact: 0.13, fatigueImpact: 0.09, adminLoad: 0.98, requiredRoom: 'vestibularLab' },
  { id: 'postOpPathway', name: 'Post-op Pathway', duration: 50, baseRevenue: 295, qualityImpact: 0.12, fatigueImpact: 0.09, adminLoad: 1.2, requiredRoom: 'treatment' },
  { id: 'chronicPainProgram', name: 'Chronic Pain Program', duration: 45, baseRevenue: 252, qualityImpact: 0.11, fatigueImpact: 0.072, adminLoad: 1.28, requiredRoom: 'gym' },
  { id: 'premiumAssessment', name: 'Premium Assessment', duration: 70, baseRevenue: 410, qualityImpact: 0.16, fatigueImpact: 0.115, adminLoad: 1.45, requiredRoom: 'treatment' }
];

export const UPGRADES: UpgradeDefinition[] = [
  { id: 'ehr_automation', name: 'EHR Automation', cost: 2800, description: 'Reduce admin burden and documentation delays.', effects: { adminReduction: 0.18 } },
  { id: 'online_booking', name: 'Online Booking Portal', cost: 2200, description: 'Reduce no-shows and improve referrals.', effects: { noShowReduction: 0.12, referralMult: 0.08 } },
  { id: 'community_marketing', name: 'Community Sports Marketing', cost: 3200, description: 'Improve referral pipeline and brand awareness.', effects: { referralMult: 0.16 } },
  { id: 'staff_wellness', name: 'Staff Wellness Program', cost: 2550, description: 'Boost morale and burnout resilience.', effects: { moraleGain: 10 } },
  { id: 'premium_branding', name: 'Premium Clinic Branding', cost: 3800, description: 'Increase pricing power and perceived quality.', effects: { premiumPricing: 0.12, qualityBonus: 0.05 } },
  { id: 'clinic_expansion_i', name: 'Lease Expansion I', cost: 4500, description: 'Increase layout capacity.', effects: { maxClinicSize: 8 } },
  { id: 'clinic_expansion_ii', name: 'Lease Expansion II', cost: 8600, description: 'Increase layout capacity further.', effects: { maxClinicSize: 12 } },
  { id: 'vestibular_suite', name: 'Vestibular Suite Certification', cost: 5700, description: 'Unlock vestibular lab and services.', effects: { unlockRooms: ['vestibularLab'], unlockServices: ['vestibularProgram'] } },
  { id: 'hydro_program', name: 'Hydro Therapy Program', cost: 7400, description: 'Unlock hydro room and specialty service access.', effects: { unlockRooms: ['hydro'], qualityBonus: 0.08 } },
  { id: 'advanced_certification', name: 'Advanced Clinical Certification', cost: 6400, description: 'Boost quality outcomes in complex cohorts.', effects: { qualityBonus: 0.1 } }
];

export const DIFFICULTY_PRESETS: DifficultyPreset[] = [
  { id: 'relaxed', name: 'Relaxed', demandMultiplier: 1, revenueMultiplier: 1, expenseMultiplier: 1 },
  { id: 'standard', name: 'Standard', demandMultiplier: 1, revenueMultiplier: 1, expenseMultiplier: 1 },
  { id: 'hardcore', name: 'Hardcore', demandMultiplier: 1, revenueMultiplier: 1, expenseMultiplier: 1 }
];

export const SIMULATION_BALANCE: SimulationBalance = {
  minDailyDemand: 5,
  maxDailyDemand: 40,
  referralsToDemand: 0.8,
  reputationToDemand: 0.1,
  uninsuredThreshold: 0.35,
  capacityPerStaff: 5.4,
  fatigueCapacityDivisor: 200,
  roomThroughputUnit: 6,
  overcrowdThreshold: 4,
  overcrowdPenalty: 0.8,
  baseNoShowBuffer: 0.015,
  minNoShowChance: 0.02,
  maxNoShowChance: 0.45,
  comfortCapacityRatio: 0.6,
  waitUnitMinutes: 4,
  qualityFatigueDivisor: 220,
  fatigueServiceScale: 16,
  fatigueResistanceWeight: 0.45,
  moraleGainScaling: 0.05,
  insuredRevenueMultiplier: 0.92,
  selfPayRevenueMultiplier: 1.12,
  adminReductionWeight: 1.1,
  documentationThroughput: 2.8,
  docsPenaltyThreshold: 11,
  docsPenaltyUnit: 14,
  dailyFatigueRecovery: 10,
  lowResistanceRecoveryPenalty: 1.8
};
