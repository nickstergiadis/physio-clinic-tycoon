import { CAMPAIGN_SCENARIOS, REPUTATION_TIERS } from '../data/content';
import { GameState, ObjectiveMetric, ScenarioDefinition, ScenarioId } from '../types/game';

export const getScenario = (scenarioId: ScenarioId): ScenarioDefinition => CAMPAIGN_SCENARIOS[scenarioId] ?? CAMPAIGN_SCENARIOS.community_rebuild;

const metricValue = (state: GameState, metric: ObjectiveMetric): number => {
  switch (metric) {
    case 'cash':
      return state.cash;
    case 'reputation':
      return state.reputation;
    case 'districtTier':
      return state.districtTier;
    case 'attendedVisits':
      return state.lifetimeStats.attendedVisits;
    case 'avgOutcome':
      return state.lifetimeStats.avgOutcomeRolling;
    case 'serviceDiversity':
      return state.unlockedServices.length;
    case 'loanCleared':
      return state.loan ? 0 : 1;
    default:
      return 0;
  }
};

export const evaluateObjectives = (state: GameState): GameState => {
  if (state.mode !== 'campaign') return state;
  const scenario = getScenario(state.scenarioId);

  const nextProgress = scenario.objectives.map((objective) => {
    const existing = state.objectiveProgress.find((progress) => progress.objectiveId === objective.id);
    if (existing?.completed) return existing;

    const completed = metricValue(state, objective.metric) >= objective.target;
    return {
      objectiveId: objective.id,
      completed,
      completedWeek: completed ? state.week : undefined
    };
  });

  return {
    ...state,
    objectiveProgress: nextProgress
  };
};

export const applyReputationTiers = (state: GameState): GameState => {
  let next = state;
  REPUTATION_TIERS.forEach((tier, idx) => {
    const rewardKey = `tier_${tier.id}`;
    if (state.reputation >= tier.threshold && !state.unlockedTierRewards.includes(rewardKey)) {
      next = {
        ...next,
        districtTier: Math.max(next.districtTier, idx + 1),
        cash: next.cash + tier.grant,
        unlockedServices: [...new Set([...next.unlockedServices, ...tier.unlockServices])],
        unlockedUpgrades: [...new Set([...next.unlockedUpgrades, ...tier.unlockUpgrades])],
        unlockedTierRewards: [...next.unlockedTierRewards, rewardKey],
        eventLog: [`Reached ${tier.id} reputation band: +$${tier.grant} grant and new unlocks.`, ...next.eventLog].slice(0, 12)
      };
    }
  });

  return next;
};

export const objectiveStatus = (state: GameState) => {
  const scenario = getScenario(state.scenarioId);
  return scenario.objectives.map((objective) => {
    const progress = state.objectiveProgress.find((entry) => entry.objectiveId === objective.id);
    return {
      ...objective,
      completed: Boolean(progress?.completed),
      value: metricValue(state, objective.metric)
    };
  });
};

export const isScenarioWon = (state: GameState): boolean => {
  if (state.mode !== 'campaign') return false;
  const scenario = getScenario(state.scenarioId);
  return scenario.objectives
    .filter((objective) => !objective.optional)
    .every((objective) => state.objectiveProgress.find((entry) => entry.objectiveId === objective.id)?.completed);
};

export const isScenarioFailed = (state: GameState): boolean => {
  if (state.mode !== 'campaign') return false;
  const scenario = getScenario(state.scenarioId);
  const hardFailure = state.cash <= scenario.failure.maxDebt && state.week >= scenario.failure.stressWeek;
  const repFailure = state.reputation <= scenario.failure.minReputation && state.week >= scenario.failure.stressWeek;
  return hardFailure || repFailure;
};
