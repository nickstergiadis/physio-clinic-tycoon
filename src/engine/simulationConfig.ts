import { DIFFICULTY_PRESETS, SIMULATION_BALANCE, UPGRADES } from '../data/content';
import { DifficultyPreset, DifficultyPresetId, GameState, UpgradeDefinition } from '../types/game';

export const getDifficultyPreset = (id: DifficultyPresetId): DifficultyPreset =>
  DIFFICULTY_PRESETS.find((preset) => preset.id === id) ?? DIFFICULTY_PRESETS[0];

export const unlockedUpgradeEffects = (state: GameState): UpgradeDefinition['effects'][] =>
  UPGRADES.filter((upgrade) => state.unlockedUpgrades.includes(upgrade.id)).map((upgrade) => upgrade.effects);

export const sumUpgradeEffect = (
  state: GameState,
  selector: (effects: UpgradeDefinition['effects']) => number | undefined
): number => unlockedUpgradeEffects(state).reduce((sum, effects) => sum + (selector(effects) ?? 0), 0);

export const BALANCE = SIMULATION_BALANCE;
