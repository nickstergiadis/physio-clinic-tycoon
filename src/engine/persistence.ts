import { SAVE_VERSION } from '../data/content';
import { GameState, SaveSlot } from '../types/game';
import { createInitialState } from './state';

const SLOTS_KEY = 'physio_tycoon_slots_v1';
const SETTINGS_KEY = 'physio_tycoon_settings_v1';

const migrateState = (state: Partial<GameState>, fromVersion: number): Partial<GameState> => {
  if (fromVersion < 2) {
    return {
      ...state,
      scenarioId: state.scenarioId ?? 'default',
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

  return state;
};

const sanitizeState = (state: GameState): GameState => {
  if (!state || typeof state !== 'object') return createInitialState('campaign');
  const migrated = migrateState(state, state.version ?? 1);
  const base = createInitialState(migrated.mode ?? 'campaign');
  const merged: GameState = {
    ...base,
    ...migrated,
    version: SAVE_VERSION,
    staff: Array.isArray(migrated.staff) ? migrated.staff : base.staff,
    rooms: Array.isArray(migrated.rooms) ? migrated.rooms : base.rooms,
    unlockedUpgrades: Array.isArray(migrated.unlockedUpgrades) ? migrated.unlockedUpgrades : base.unlockedUpgrades,
    unlockedRooms: Array.isArray(migrated.unlockedRooms) ? migrated.unlockedRooms : base.unlockedRooms,
    unlockedServices: Array.isArray(migrated.unlockedServices) ? migrated.unlockedServices : base.unlockedServices,
    patientQueue: Array.isArray(migrated.patientQueue) ? migrated.patientQueue : base.patientQueue,
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
    }
  };

  merged.clinicSize = merged.rooms.length;
  merged.maxClinicSize = Math.max(merged.maxClinicSize, 6);
  merged.speed = [0, 1, 2, 3].includes(merged.speed) ? merged.speed : 0;
  return merged;
};

export const loadSlots = (): SaveSlot[] => {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SaveSlot[];
    return parsed.map((slot) => ({ ...slot, state: sanitizeState(slot.state) }));
  } catch {
    return [];
  }
};

export const saveSlot = (slotId: string, label: string, state: GameState): SaveSlot[] => {
  const slots = loadSlots();
  const payload: SaveSlot = { id: slotId, label, timestamp: Date.now(), version: SAVE_VERSION, state: sanitizeState(state) };
  const existingIdx = slots.findIndex((s) => s.id === slotId);
  const next = existingIdx >= 0 ? slots.map((s, idx) => (idx === existingIdx ? payload : s)) : [...slots, payload];
  localStorage.setItem(SLOTS_KEY, JSON.stringify(next));
  return next;
};

export const deleteSlot = (slotId: string): SaveSlot[] => {
  const next = loadSlots().filter((s) => s.id !== slotId);
  localStorage.setItem(SLOTS_KEY, JSON.stringify(next));
  return next;
};

export const loadSettings = (): GameState['settings'] => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return createInitialState('campaign').settings;
    const parsed = JSON.parse(raw) as GameState['settings'];
    return {
      soundEnabled: Boolean(parsed.soundEnabled),
      ambientEnabled: Boolean(parsed.ambientEnabled),
      showTutorialHints: Boolean(parsed.showTutorialHints)
    };
  } catch {
    return createInitialState('campaign').settings;
  }
};

export const saveSettings = (settings: GameState['settings']): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};
