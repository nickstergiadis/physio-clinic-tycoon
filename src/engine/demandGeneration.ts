import { PATIENT_ARCHETYPES } from '../data/content';
import { GameState, PatientArchetype } from '../types/game';
import { BALANCE, getDifficultyPreset, sumUpgradeEffect } from './simulationConfig';
import { getScenario } from './campaign';
import { clamp, rand } from './utils';

export const randomArchetype = (seed: number): PatientArchetype => PATIENT_ARCHETYPES[Math.floor(rand(seed) * PATIENT_ARCHETYPES.length)];

export const weightedArchetype = (seed: number, state: GameState): PatientArchetype => {
  const scenario = getScenario(state.scenarioId);
  const withWeight = PATIENT_ARCHETYPES.map((archetype) => ({
    archetype,
    weight: 1 + (scenario.demandMixBias[archetype.id] ?? 0)
  }));
  const total = withWeight.reduce((sum, item) => sum + item.weight, 0);
  let roll = rand(seed) * total;
  for (const item of withWeight) {
    roll -= item.weight;
    if (roll <= 0) return item.archetype;
  }
  return randomArchetype(seed);
};

export interface DemandInputs {
  leads: number;
  bookingRate: number;
}

export const calculateDemandInputs = (state: GameState): DemandInputs => {
  const preset = getDifficultyPreset(state.difficultyPreset);
  const modifier = state.operationalModifiers;
  const baseDemand = Math.max(BALANCE.minDailyDemand, Math.round(state.referrals * BALANCE.referralsToDemand + state.reputation * BALANCE.reputationToDemand));
  const demandMult = (1 + sumUpgradeEffect(state, (effects) => effects.referralMult)) * preset.demandMultiplier * modifier.leadMultiplier;
  const leads = Math.min(BALANCE.maxDailyDemand + 18, Math.round(baseDemand * demandMult));
  const bookingRate = clamp(
    0.52 + state.reputation * 0.002 + state.staff.reduce((sum, member) => sum + member.communication, 0) / Math.max(1, state.staff.length * 12) + modifier.bookingShift,
    0.4,
    0.93
  );

  return { leads, bookingRate };
};
