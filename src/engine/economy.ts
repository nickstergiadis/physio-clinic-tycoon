import { ROOM_DEFS } from '../data/content';
import { DaySummary, GameState } from '../types/game';
import { getDifficultyPreset } from './simulationConfig';
import { getBuildItemMaintenancePerDay } from './buildItems';

export const totalWeeklyFixedCosts = (state: GameState): number => {
  const payroll = state.staff.reduce((sum, staffMember) => sum + staffMember.wage, 0) * 7;
  const roomMaintenance = state.rooms.reduce((sum, room) => sum + (ROOM_DEFS.find((def) => def.id === room.type)?.maintenance ?? 0), 0) * 7;
  const itemMaintenance = getBuildItemMaintenancePerDay(state) * 7;
  return payroll + state.rent * 7 + state.equipmentCost * 7 + roomMaintenance + itemMaintenance;
};

export interface DailyEconomy {
  dayOfWeek: number;
  weeklyCostsApplied: number;
  daysUntilWeeklyCosts: number;
  expenses: number;
  profit: number;
}

export const resolveDailyEconomy = (state: GameState, revenue: number, variableCosts: number, weeklyFixedCosts: number): DailyEconomy => {
  const dayOfWeek = ((state.day - 1) % 7) + 1;
  const weeklyCostsApplied = dayOfWeek === 7 ? weeklyFixedCosts : 0;
  const daysUntilWeeklyCosts = dayOfWeek === 7 ? 7 : 7 - dayOfWeek;
  const preset = getDifficultyPreset(state.difficultyPreset);
  const expenses = (variableCosts + weeklyCostsApplied) * preset.expenseMultiplier;
  const profit = revenue - expenses;

  return {
    dayOfWeek,
    weeklyCostsApplied,
    daysUntilWeeklyCosts,
    expenses,
    profit
  };
};

export const buildWeeklyLedger = (state: GameState, dayOfWeek: number, revenue: number, variableCosts: number, attended: number, noShows: number): GameState['weeklyLedger'] => ({
  revenue: dayOfWeek === 7 ? 0 : state.weeklyLedger.revenue + revenue,
  variableCosts: dayOfWeek === 7 ? 0 : state.weeklyLedger.variableCosts + variableCosts,
  attendedVisits: dayOfWeek === 7 ? 0 : state.weeklyLedger.attendedVisits + attended,
  noShows: dayOfWeek === 7 ? 0 : state.weeklyLedger.noShows + noShows
});

export const buildDaySummaryEconomyFields = (summary: DaySummary, economy: DailyEconomy): DaySummary => ({
  ...summary,
  expenses: Math.round(economy.expenses),
  profit: Math.round(economy.profit),
  fixedCosts: Math.round(economy.weeklyCostsApplied),
  daysUntilWeeklyCosts: economy.daysUntilWeeklyCosts
});
