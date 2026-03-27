import { EventCard, GameState } from '../types/game';
import { clamp, rand } from './utils';

const keepEventLog = (state: GameState, line: string): string[] => [`${state.day}: ${line}`, ...state.eventLog].slice(0, 12);

const withModifier = (state: GameState, patch: Partial<GameState['operationalModifiers']>, note: string): GameState => ({
  ...state,
  operationalModifiers: {
    ...state.operationalModifiers,
    ...patch,
    note
  },
  eventLog: keepEventLog(state, note)
});

export const EVENT_CARDS: EventCard[] = [
  { id: 'mva_batch', name: 'MVA Referral Batch', description: 'Insurer-heavy referrals arrived.', chance: 0.07, apply: (s) => withModifier({ ...s, referrals: s.referrals + 2 }, { leadMultiplier: s.operationalModifiers.leadMultiplier + 0.15 }, 'MVA referrals boosted leads but increased paperwork complexity.') },
  { id: 'flu_wave', name: 'Seasonal Flu Wave', description: 'More no-shows this day.', chance: 0.06, apply: (s) => withModifier(s, { noShowShift: s.operationalModifiers.noShowShift + 0.09, bookingShift: s.operationalModifiers.bookingShift - 0.03 }, 'Seasonal flu reduced attendance reliability today.') },
  { id: 'sports_tournament', name: 'Local Sports Tournament', description: 'Higher athlete demand.', chance: 0.06, apply: (s) => withModifier({ ...s, reputation: clamp(s.reputation + 0.6, 0, 100) }, { leadMultiplier: s.operationalModifiers.leadMultiplier + 0.18 }, 'Local tournament increased sports injury referrals.') },
  { id: 'ehr_outage', name: 'EHR Outage', description: 'Documentation is delayed.', chance: 0.035, apply: (s) => withModifier({ ...s, backlogDocs: s.backlogDocs + 2 }, { variableCostShift: s.operationalModifiers.variableCostShift + 0.08 }, 'EHR outage slowed admin processing and raised variable costs.') },
  { id: 'staff_conflict', name: 'Staff Conflict', description: 'Morale drop for the team.', chance: 0.04, apply: (s) => withModifier({ ...s, staff: s.staff.map((m) => ({ ...m, morale: clamp(m.morale - 3, 0, 100) })) }, { cancellationShift: s.operationalModifiers.cancellationShift + 0.04 }, 'Team conflict increased same-day cancellations.') },
  { id: 'equipment_break', name: 'Equipment Breakdown', description: 'Maintenance costs increase.', chance: 0.05, apply: (s) => withModifier({ ...s, equipmentCost: s.equipmentCost + 25 }, { variableCostShift: s.operationalModifiers.variableCostShift + 0.05 }, 'Equipment issue reduced throughput efficiency today.') },
  { id: 'positive_reviews', name: 'Positive Review Streak', description: 'Boost in referrals and reputation.', chance: 0.09, apply: (s) => withModifier({ ...s, referrals: s.referrals + 1, reputation: clamp(s.reputation + 1.8, 0, 100) }, { bookingShift: s.operationalModifiers.bookingShift + 0.05 }, 'Positive reviews improved booking conversion.') },
  { id: 'insurer_audit', name: 'Insurer Audit', description: 'Administrative pressure rises.', chance: 0.03, apply: (s) => withModifier({ ...s, backlogDocs: s.backlogDocs + 3, cash: s.cash - 140 }, { cancellationShift: s.operationalModifiers.cancellationShift + 0.03 }, 'Insurer audit consumed admin time and triggered cancellations.') },
  { id: 'community_fair', name: 'Community Health Fair', description: 'New leads and branding.', chance: 0.08, apply: (s) => withModifier({ ...s, cash: s.cash - 120, reputation: clamp(s.reputation + 1.3, 0, 100) }, { leadMultiplier: s.operationalModifiers.leadMultiplier + 0.2 }, 'Community fair generated a fresh lead burst.') },
  { id: 'staff_training_day', name: 'Staff Training Day', description: 'Quality up, capacity down briefly.', chance: 0.07, apply: (s) => withModifier({ ...s, staff: s.staff.map((m) => ({ ...m, quality: clamp(m.quality + 0.01, 0, 1), fatigue: clamp(m.fatigue + 3, 0, 100) })) }, { cancellationShift: s.operationalModifiers.cancellationShift + 0.02 }, 'Training improved quality but reduced appointment reliability.') },
  { id: 'rent_review', name: 'Rent Review', description: 'Rent increases slightly.', chance: 0.03, apply: (s) => ({ ...s, rent: s.rent + 20, eventLog: keepEventLog(s, 'Landlord issued a rent uplift for upcoming weeks.') }) }
];

export const applyRandomEvent = (state: GameState): GameState => {
  const eventRoll = rand(state.seed + state.day * 13);
  const selectedEvent = EVENT_CARDS.find((_, idx) => eventRoll < EVENT_CARDS.slice(0, idx + 1).reduce((sum, event) => sum + event.chance, 0));
  return selectedEvent ? selectedEvent.apply(state) : state;
};
