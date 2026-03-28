import { SAVE_VERSION } from '../data/content';
import { GameState } from '../types/game';
import { createInitialState } from './state';

const mergedDayToMinute = (day: number) => day * 24 * 60;

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

  if (fromVersion < 8) {
    return {
      ...state,
      bookingPolicy: state.bookingPolicy ?? undefined,
      latestSchedule: state.latestSchedule ?? undefined
    };
  }

  if (fromVersion < 9) {
    return {
      ...state,
      placedItems: state.placedItems ?? undefined
    };
  }

  if (fromVersion < 10) {
    return {
      ...state,
      activeIncidents: state.activeIncidents ?? undefined
    };
  }

  if (fromVersion < 11) {
    return {
      ...state,
      objectiveProgress: state.objectiveProgress ?? undefined
    };
  }

  if (fromVersion < 12) {
    return {
      ...state,
      dailyTrends: state.dailyTrends ?? undefined,
      weeklyReports: state.weeklyReports ?? undefined
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
    placedItems: Array.isArray(migrated.placedItems)
      ? migrated.placedItems
          .filter((item) => typeof item?.itemId === 'string' && typeof item?.x === 'number' && typeof item?.y === 'number')
          .map((item, idx) => ({
            ...base.placedItems[idx % Math.max(1, base.placedItems.length)],
            ...item,
            id: item.id ?? `${item.itemId}-${item.x}-${item.y}-${idx}`
          }))
      : base.placedItems,
    pathTiles: Array.isArray(migrated.pathTiles)
      ? migrated.pathTiles.filter((tile) => typeof tile?.x === 'number' && typeof tile?.y === 'number').map((tile) => ({ x: tile.x, y: tile.y }))
      : base.pathTiles,
    unlockedUpgrades: Array.isArray(migrated.unlockedUpgrades) ? migrated.unlockedUpgrades : base.unlockedUpgrades,
    unlockedRooms: Array.isArray(migrated.unlockedRooms) ? migrated.unlockedRooms : base.unlockedRooms,
    unlockedServices: Array.isArray(migrated.unlockedServices) ? migrated.unlockedServices : base.unlockedServices,
    patientQueue: Array.isArray(migrated.patientQueue)
      ? migrated.patientQueue.map((visit) => ({
          ...visit,
          patientId: visit.patientId ?? visit.id,
          scheduledSlot: visit.scheduledSlot ?? 0,
          scheduledMinute: visit.scheduledMinute ?? mergedDayToMinute(migrated.day ?? base.day),
          expectedDuration: visit.expectedDuration ?? 30,
          arrivalOffsetMinutes: visit.arrivalOffsetMinutes ?? 0
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
    dailyTrends: Array.isArray(migrated.dailyTrends)
      ? migrated.dailyTrends
          .filter((point) => typeof point?.day === 'number')
          .map((point) => ({
            day: point.day,
            cash: point.cash ?? 0,
            reputation: point.reputation ?? 0,
            utilization: point.utilization ?? 0,
            profit: point.profit ?? 0,
            avgOutcome: point.avgOutcome ?? 0,
            avgWait: point.avgWait ?? 0,
            attendedVisits: point.attendedVisits ?? 0,
            noShows: point.noShows ?? 0
          }))
          .slice(-84)
      : base.dailyTrends,
    weeklyReports: Array.isArray(migrated.weeklyReports)
      ? migrated.weeklyReports
          .filter((report) => typeof report?.week === 'number')
          .map((report) => ({
            week: report.week,
            startDay: report.startDay ?? Math.max(1, report.week * 7 - 6),
            endDay: report.endDay ?? report.week * 7,
            revenue: report.revenue ?? 0,
            expenses: report.expenses ?? 0,
            profit: report.profit ?? 0,
            attendedVisits: report.attendedVisits ?? 0,
            noShows: report.noShows ?? 0,
            avgUtilization: report.avgUtilization ?? 0,
            avgOutcome: report.avgOutcome ?? 0,
            avgWait: report.avgWait ?? 0,
            topRisk: report.topRisk ?? 'No critical risk detected.',
            coachingTip: report.coachingTip ?? 'Keep balancing throughput and quality.'
          }))
          .slice(-16)
      : base.weeklyReports,
    operationalModifiers: {
      leadMultiplier: migrated.operationalModifiers?.leadMultiplier ?? base.operationalModifiers.leadMultiplier,
      bookingShift: migrated.operationalModifiers?.bookingShift ?? base.operationalModifiers.bookingShift,
      cancellationShift: migrated.operationalModifiers?.cancellationShift ?? base.operationalModifiers.cancellationShift,
      noShowShift: migrated.operationalModifiers?.noShowShift ?? base.operationalModifiers.noShowShift,
      variableCostShift: migrated.operationalModifiers?.variableCostShift ?? base.operationalModifiers.variableCostShift,
      note: migrated.operationalModifiers?.note
    },
    bookingPolicy: migrated.bookingPolicy === 'conservative' || migrated.bookingPolicy === 'aggressive' || migrated.bookingPolicy === 'balanced'
      ? migrated.bookingPolicy
      : base.bookingPolicy,
    latestSchedule: {
      policy: migrated.latestSchedule?.policy === 'conservative' || migrated.latestSchedule?.policy === 'aggressive' || migrated.latestSchedule?.policy === 'balanced'
        ? migrated.latestSchedule.policy
        : base.latestSchedule.policy,
      slotsUsed: migrated.latestSchedule?.slotsUsed ?? base.latestSchedule.slotsUsed,
      totalSlots: migrated.latestSchedule?.totalSlots ?? base.latestSchedule.totalSlots,
      queueLengthPeak: migrated.latestSchedule?.queueLengthPeak ?? base.latestSchedule.queueLengthPeak,
      missedAppointments: migrated.latestSchedule?.missedAppointments ?? base.latestSchedule.missedAppointments,
      lateArrivals: migrated.latestSchedule?.lateArrivals ?? base.latestSchedule.lateArrivals,
      earlyArrivals: migrated.latestSchedule?.earlyArrivals ?? base.latestSchedule.earlyArrivals,
      overruns: migrated.latestSchedule?.overruns ?? base.latestSchedule.overruns,
      spilloverMinutes: migrated.latestSchedule?.spilloverMinutes ?? base.latestSchedule.spilloverMinutes,
      unusedGaps: migrated.latestSchedule?.unusedGaps ?? base.latestSchedule.unusedGaps
    },
    activeIncidents: Array.isArray(migrated.activeIncidents)
      ? migrated.activeIncidents
          .filter((incident) => typeof incident?.id === 'string' && typeof incident?.name === 'string')
          .map((incident) => ({
            id: incident.id,
            chainId: incident.chainId ?? incident.id,
            name: incident.name,
            description: incident.description ?? '',
            startedDay: incident.startedDay ?? base.day,
            daysRemaining: Math.max(0, incident.daysRemaining ?? 0),
            stage: incident.stage === 'trigger' || incident.stage === 'resolution' ? incident.stage : 'ongoing',
            effectsSummary: incident.effectsSummary ?? '',
            ongoingEffects: {
              ...incident.ongoingEffects,
              modifierPatch: incident.ongoingEffects?.modifierPatch ?? {}
            },
            pendingDecision: incident.pendingDecision
              ? {
                  stage: incident.pendingDecision.stage === 'resolution' ? 'resolution' : 'trigger',
                  prompt: incident.pendingDecision.prompt ?? '',
                  options: Array.isArray(incident.pendingDecision.options) ? incident.pendingDecision.options : [],
                  defaultOptionId: incident.pendingDecision.defaultOptionId ?? incident.pendingDecision.options?.[0]?.id ?? ''
                }
              : undefined
          }))
      : base.activeIncidents,
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
  if (!['community_rebuild', 'sports_performance', 'insurance_crunch', 'rural_outreach', 'elite_concierge'].includes(merged.scenarioId)) {
    merged.scenarioId = base.scenarioId;
  }
  merged.maxClinicSize = Math.max(merged.maxClinicSize, 6);
  merged.speed = [0, 1, 2, 3].includes(merged.speed) ? merged.speed : 0;
  return merged;
};
