import { SAVE_VERSION } from '../data/content';
import { GameState } from '../types/game';
import { createInitialState } from './state';

export const migrateStateByVersion = (state: Partial<GameState>, fromVersion: number): Partial<GameState> => {
  if (fromVersion < 2) {
    return {
      ...state,
      scenarioId: (state.scenarioId as GameState['scenarioId']) ?? 'community_rebuild',
      difficultyPreset: state.difficultyPreset ?? (state.mode === 'sandbox' ? 'relaxed' : 'standard')
    };
  }

  if (fromVersion < 3) {
    return {
      ...state,
      demandSnapshot: state.demandSnapshot ?? undefined,
      weeklyLedger: state.weeklyLedger ?? undefined,
      operationalModifiers: state.operationalModifiers ?? undefined
    };
  }

  if (fromVersion < 4) {
    return {
      ...state,
      staff: state.staff ?? undefined,
      rooms: state.rooms ?? undefined
    };
  }

  if (fromVersion < 5) {
    return {
      ...state,
      objectiveProgress: state.objectiveProgress ?? undefined,
      districtTier: state.districtTier ?? undefined,
      unlockedTierRewards: state.unlockedTierRewards ?? undefined,
      loan: state.loan ?? undefined,
      lifetimeStats: state.lifetimeStats ?? undefined
    };
  }

  if (fromVersion < 6) {
    return {
      ...state,
      patients: state.patients ?? undefined
    };
  }

  if (fromVersion < 7) {
    return {
      ...state,
      pathTiles: state.pathTiles ?? undefined
    };
  }

  return state;
};

export const sanitizeState = (state: GameState): GameState => {
  if (!state || typeof state !== 'object') return createInitialState('campaign');
  const migrated = migrateStateByVersion(state, state.version ?? 1);
  const base = createInitialState(migrated.mode ?? 'campaign');
  const merged: GameState = {
    ...base,
    ...migrated,
    version: SAVE_VERSION,
    staff: Array.isArray(migrated.staff)
      ? migrated.staff.map((member, idx) => ({
          ...base.staff[Math.min(idx, base.staff.length - 1)],
          ...member,
          assignedRoom: member.assignedRoom ?? (member.role === 'frontDesk' ? 'reception' : 'flex'),
          trait: member.trait ?? 'steady',
          specialtyFocus: member.specialtyFocus ?? 'officeWorker',
          shift: member.shift ?? (member.scheduled ? 'full' : 'off'),
          level: member.level ?? 1,
          xp: member.xp ?? 0,
          trainingDaysRemaining: member.trainingDaysRemaining ?? 0,
          certifications: Array.isArray(member.certifications) ? member.certifications : [],
          burnoutRisk: member.burnoutRisk ?? 0.1
        }))
      : base.staff,
    rooms: Array.isArray(migrated.rooms)
      ? migrated.rooms.map((room, idx) => ({
          ...base.rooms[Math.min(idx, base.rooms.length - 1)],
          ...room,
          equipmentLevel: room.equipmentLevel ?? 1,
          focusService: room.focusService ?? 'general'
        }))
      : base.rooms,
    pathTiles: Array.isArray(migrated.pathTiles)
      ? migrated.pathTiles.filter((tile) => typeof tile?.x === 'number' && typeof tile?.y === 'number').map((tile) => ({ x: tile.x, y: tile.y }))
      : base.pathTiles,
    unlockedUpgrades: Array.isArray(migrated.unlockedUpgrades) ? migrated.unlockedUpgrades : base.unlockedUpgrades,
    unlockedRooms: Array.isArray(migrated.unlockedRooms) ? migrated.unlockedRooms : base.unlockedRooms,
    unlockedServices: Array.isArray(migrated.unlockedServices) ? migrated.unlockedServices : base.unlockedServices,
    patientQueue: Array.isArray(migrated.patientQueue)
      ? migrated.patientQueue.map((visit) => ({
          ...visit,
          patientId: visit.patientId ?? visit.id
        }))
      : base.patientQueue,
    patients: Array.isArray(migrated.patients)
      ? migrated.patients.map((patient) => ({
          ...patient,
          payerType: patient.payerType ?? 'insured',
          lifecycleState: patient.lifecycleState ?? 'lead',
          clinicalProgress: patient.clinicalProgress ?? 0,
          satisfaction: patient.satisfaction ?? 0.6,
          patience: patient.patience ?? 0.6,
          adherence: patient.adherence ?? 0.6,
          noShowPropensity: patient.noShowPropensity ?? 0.12,
          referralLikelihood: patient.referralLikelihood ?? 0.3,
          expectedTotalVisits: patient.expectedTotalVisits ?? 6,
          remainingVisits: patient.remainingVisits ?? patient.expectedTotalVisits ?? 6,
          nextRecommendedService: patient.nextRecommendedService ?? 'followUp',
          futureBookings: Array.isArray(patient.futureBookings) ? patient.futureBookings : []
        }))
      : base.patients,
    demandSnapshot: {
      inboundLeads: migrated.demandSnapshot?.inboundLeads ?? base.demandSnapshot.inboundLeads,
      bookedVisits: migrated.demandSnapshot?.bookedVisits ?? base.demandSnapshot.bookedVisits,
      utilization: migrated.demandSnapshot?.utilization ?? base.demandSnapshot.utilization,
      lostDemand: {
        unbooked: migrated.demandSnapshot?.lostDemand?.unbooked ?? base.demandSnapshot.lostDemand.unbooked,
        serviceMismatch: migrated.demandSnapshot?.lostDemand?.serviceMismatch ?? base.demandSnapshot.lostDemand.serviceMismatch,
        capacity: migrated.demandSnapshot?.lostDemand?.capacity ?? base.demandSnapshot.lostDemand.capacity,
        cancellations: migrated.demandSnapshot?.lostDemand?.cancellations ?? base.demandSnapshot.lostDemand.cancellations,
        noShows: migrated.demandSnapshot?.lostDemand?.noShows ?? base.demandSnapshot.lostDemand.noShows
      }
    },
    weeklyLedger: {
      revenue: migrated.weeklyLedger?.revenue ?? base.weeklyLedger.revenue,
      variableCosts: migrated.weeklyLedger?.variableCosts ?? base.weeklyLedger.variableCosts,
      attendedVisits: migrated.weeklyLedger?.attendedVisits ?? base.weeklyLedger.attendedVisits,
      noShows: migrated.weeklyLedger?.noShows ?? base.weeklyLedger.noShows
    },
    operationalModifiers: {
      leadMultiplier: migrated.operationalModifiers?.leadMultiplier ?? base.operationalModifiers.leadMultiplier,
      bookingShift: migrated.operationalModifiers?.bookingShift ?? base.operationalModifiers.bookingShift,
      cancellationShift: migrated.operationalModifiers?.cancellationShift ?? base.operationalModifiers.cancellationShift,
      noShowShift: migrated.operationalModifiers?.noShowShift ?? base.operationalModifiers.noShowShift,
      variableCostShift: migrated.operationalModifiers?.variableCostShift ?? base.operationalModifiers.variableCostShift,
      note: migrated.operationalModifiers?.note
    },
    eventLog: Array.isArray(migrated.eventLog) ? migrated.eventLog : base.eventLog,
    settings: {
      soundEnabled: Boolean(migrated.settings?.soundEnabled ?? base.settings.soundEnabled),
      ambientEnabled: Boolean(migrated.settings?.ambientEnabled ?? base.settings.ambientEnabled),
      showTutorialHints: Boolean(migrated.settings?.showTutorialHints ?? base.settings.showTutorialHints)
    },
    campaignGoal: {
      targetWeek: migrated.campaignGoal?.targetWeek ?? base.campaignGoal.targetWeek,
      targetReputation: migrated.campaignGoal?.targetReputation ?? base.campaignGoal.targetReputation,
      targetCash: migrated.campaignGoal?.targetCash ?? base.campaignGoal.targetCash
    },
    objectiveProgress: Array.isArray(migrated.objectiveProgress) ? migrated.objectiveProgress : base.objectiveProgress,
    districtTier: migrated.districtTier ?? base.districtTier,
    unlockedTierRewards: Array.isArray(migrated.unlockedTierRewards) ? migrated.unlockedTierRewards : base.unlockedTierRewards,
    loan: migrated.loan
      ? {
          principal: migrated.loan.principal ?? 0,
          interestRate: migrated.loan.interestRate ?? 0.028,
          termWeeks: migrated.loan.termWeeks ?? 8,
          weeksRemaining: migrated.loan.weeksRemaining ?? 8,
          weeklyPayment: migrated.loan.weeklyPayment ?? 0
        }
      : base.loan,
    lifetimeStats: {
      attendedVisits: migrated.lifetimeStats?.attendedVisits ?? base.lifetimeStats.attendedVisits,
      avgOutcomeRolling: migrated.lifetimeStats?.avgOutcomeRolling ?? base.lifetimeStats.avgOutcomeRolling
    },
    dev: {
      highNoShowMode: Boolean(migrated.dev?.highNoShowMode ?? base.dev?.highNoShowMode ?? false)
    }
  };

  merged.clinicSize = merged.rooms.length;
  if (!['community_rebuild', 'sports_performance', 'insurance_crunch'].includes(merged.scenarioId)) {
    merged.scenarioId = base.scenarioId;
  }
  merged.maxClinicSize = Math.max(merged.maxClinicSize, 6);
  merged.speed = [0, 1, 2, 3].includes(merged.speed) ? merged.speed : 0;
  return merged;
};
