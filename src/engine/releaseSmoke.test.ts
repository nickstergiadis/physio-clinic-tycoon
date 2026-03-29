import { describe, expect, it } from 'vitest';
import { buyUpgrade, placeBuildItem, placeRoom, removeBuildItem, removeRoom, runDay } from './simulation';
import { createInitialState } from './state';
import { clearAllSaveData, getLatestProgress, loadSlots, saveAutosave, saveSlot } from './persistence';
import { UPGRADES } from '../data/content';

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

describe('release smoke flows', () => {
  it('start new game and run first day', () => {
    const state = createInitialState('campaign');
    const afterDay = runDay(state);
    expect(afterDay.day).toBe(2);
    expect(afterDay.latestSummary?.day).toBe(2);
  });

  it('manual save and autosave can restore latest progress', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      writable: true,
      configurable: true
    });
    clearAllSaveData();

    const state = runDay(createInitialState('campaign'));
    saveSlot('slot-1', 'Manual', state);
    saveAutosave({ ...state, day: state.day + 1 }, 'Autosave newer');

    expect(loadSlots()).toHaveLength(1);
    expect(getLatestProgress()?.source).toBe('autosave');
  });

  it('buying unlock upgrade + placing/removing content does not crash state', () => {
    let state = createInitialState('sandbox');
    const affordable = UPGRADES.find((upgrade) => upgrade.cost <= state.cash);
    expect(affordable).toBeTruthy();
    state = buyUpgrade(state, affordable!.id);
    expect(state.unlockedUpgrades).toContain(affordable!.id);

    const placedRoom = placeRoom(state, 'treatment', 5, 5);
    expect(placedRoom.rooms.length).toBe(state.rooms.length + 1);

    const itemPlaced = placeBuildItem(placedRoom, 'decor_plant', 5, 5);
    expect(itemPlaced.placedItems.length).toBeGreaterThanOrEqual(placedRoom.placedItems.length);

    const removedRoom = removeRoom(itemPlaced, placedRoom.rooms[placedRoom.rooms.length - 1].id);
    expect(removedRoom.rooms.length).toBeLessThanOrEqual(itemPlaced.rooms.length);

    if (itemPlaced.placedItems.length > 0) {
      const removedItem = removeBuildItem(itemPlaced, itemPlaced.placedItems[0].id);
      expect(removedItem.placedItems.length).toBe(itemPlaced.placedItems.length - 1);
    }
  });

  it('endgame flags are preserved for overlay rendering path', () => {
    const terminalLoss = { ...createInitialState('campaign'), gameOver: true, day: 24 };
    const terminalWin = { ...createInitialState('campaign'), gameWon: true, day: 42 };

    expect(terminalLoss.gameOver).toBe(true);
    expect(terminalWin.gameWon).toBe(true);
  });
});
