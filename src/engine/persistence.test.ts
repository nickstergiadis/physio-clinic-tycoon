import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllSaveData,
  clearAutosave,
  exportSlot,
  getLatestProgress,
  importSaveFromText,
  insertImportedSlot,
  loadAutosave,
  loadSettings,
  loadSlots,
  saveAutosave,
  saveSettings,
  saveSlot
} from './persistence';
import { createInitialState } from './state';

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    }
  };
};

describe('persistence', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      writable: true,
      configurable: true
    });
    localStorage.clear();
  });

  it('saves and loads a slot', () => {
    const state = createInitialState('campaign');
    saveSlot('slot-1', 'Campaign Save', state);
    const slots = loadSlots();
    expect(slots).toHaveLength(1);
    expect(slots[0].state.day).toBe(state.day);
  });

  it('sanitizes corrupted state payloads', () => {
    localStorage.setItem('physio_tycoon_slots_v1', JSON.stringify([
      { id: 'slot-x', label: 'Broken', timestamp: Date.now(), version: 0, state: { mode: 'campaign', version: 0, settings: {} } }
    ]));

    const slots = loadSlots();
    expect(slots[0].state.rooms.length).toBeGreaterThan(0);
    expect(Array.isArray(slots[0].state.staff)).toBe(true);
    expect(slots[0].state.scenarioId).toBe('community_rebuild');
    expect(slots[0].state.difficultyPreset).toBe('standard');
    expect(Array.isArray(slots[0].state.placedItems)).toBe(true);
  });

  it('persists and clears autosave separately from manual slots', () => {
    const state = createInitialState('campaign');
    saveSlot('slot-1', 'Manual', state);
    const auto = saveAutosave({ ...state, day: 2 }, 'Autosave day 2');

    expect(loadSlots()).toHaveLength(1);
    expect(loadAutosave()?.label).toBe('Autosave day 2');
    expect(getLatestProgress()?.source).toBe('autosave');

    clearAutosave();
    expect(loadAutosave()).toBeNull();
    expect(auto.id).toBe('autosave');
  });

  it('exports and imports save files', () => {
    const state = createInitialState('sandbox');
    saveSlot('slot-1', 'Sandbox test', state);
    const raw = exportSlot(loadSlots()[0]);

    const imported = importSaveFromText(raw);
    expect(imported.label.startsWith('Imported:')).toBe(true);

    const nextSlots = insertImportedSlot(imported);
    expect(nextSlots[0].id.startsWith('import-')).toBe(true);
  });

  it('fails import for malformed payloads', () => {
    expect(() => importSaveFromText('{bad')).toThrow('Invalid JSON file.');
    expect(() => importSaveFromText(JSON.stringify({ nope: true }))).toThrow('Unsupported save file format.');
  });

  it('persists settings', () => {
    saveSettings({ soundEnabled: false, ambientEnabled: true, showTutorialHints: false });
    const settings = loadSettings();
    expect(settings.soundEnabled).toBe(false);
    expect(settings.ambientEnabled).toBe(true);
    expect(settings.showTutorialHints).toBe(false);
  });

  it('clears all local save data', () => {
    const state = createInitialState('campaign');
    saveSlot('slot-1', 'Campaign Save', state);
    saveAutosave(state, 'Auto');

    clearAllSaveData();
    expect(loadSlots()).toHaveLength(0);
    expect(loadAutosave()).toBeNull();
  });

  it('preserves new progression state across save/load', () => {
    let state = createInitialState('campaign', 'insurance_crunch', 'hardcore');
    state = {
      ...state,
      districtTier: 2,
      unlockedTierRewards: ['tier_local', 'tier_district'],
      objectiveProgress: [{ objectiveId: 'loan_clear', completed: true, completedWeek: 6 }],
      loan: {
        principal: 5000,
        interestRate: 0.03,
        termWeeks: 8,
        weeksRemaining: 3,
        weeklyPayment: 900
      },
      lifetimeStats: {
        attendedVisits: 120,
        avgOutcomeRolling: 0.64
      },
      activeIncidents: [
        {
          id: 'incident-save-1',
          chainId: 'ehr_queue_backlog',
          name: 'EHR Queue Backlog',
          description: 'Claims stuck',
          startedDay: 9,
          daysRemaining: 2,
          stage: 'ongoing',
          effectsSummary: '+docs',
          ongoingEffects: { dailyBacklogDocs: 1.2 },
          pendingDecision: {
            stage: 'resolution',
            prompt: 'Resolve',
            defaultOptionId: 'overtime',
            options: [{ id: 'overtime', label: 'Overtime', description: 'Pay and clear', effects: { cash: -100 } }]
          }
        }
      ],
      dailyTrends: [
        { day: 8, cash: 21100, reputation: 54, utilization: 78, profit: 520, avgOutcome: 0.63, avgWait: 13, attendedVisits: 14, noShows: 2 }
      ],
      weeklyReports: [
        {
          week: 2,
          startDay: 8,
          endDay: 14,
          revenue: 9100,
          expenses: 7400,
          profit: 1700,
          attendedVisits: 82,
          noShows: 9,
          avgUtilization: 76,
          avgOutcome: 0.61,
          avgWait: 14,
          topRisk: 'Attendance reliability is unstable.',
          coachingTip: 'Invest in booking discipline.'
        }
      ]
    };

    saveSlot('slot-2', 'Progress Save', state);
    const loaded = loadSlots()[0].state;
    expect(loaded.districtTier).toBe(2);
    expect(loaded.objectiveProgress[0].objectiveId).toBe('loan_clear');
    expect(loaded.loan?.weeksRemaining).toBe(3);
    expect(loaded.lifetimeStats.attendedVisits).toBe(120);
    expect(loaded.activeIncidents[0].name).toBe('EHR Queue Backlog');
    expect(loaded.activeIncidents[0].pendingDecision?.stage).toBe('resolution');
    expect(loaded.dailyTrends[0].profit).toBe(520);
    expect(loaded.weeklyReports[0].week).toBe(2);
  });
});
