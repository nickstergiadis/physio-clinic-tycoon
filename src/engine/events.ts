import { EventCard, GameState } from '../types/game';
import { clamp, rand } from './utils';

const keepEventLog = (state: GameState, line: string): string[] => [`${state.day}: ${line}`, ...state.eventLog].slice(0, 12);

export const EVENT_CARDS: EventCard[] = [
  { id: 'mva_batch', name: 'MVA Referral Batch', description: 'Insurer-heavy referrals arrived.', chance: 0.07, apply: (s) => ({ ...s, referrals: s.referrals + 3, backlogDocs: s.backlogDocs + 1, eventLog: keepEventLog(s, 'MVA referrals increased admin load.') }) },
  { id: 'flu_wave', name: 'Seasonal Flu Wave', description: 'More no-shows this day.', chance: 0.06, apply: (s) => ({ ...s, eventLog: keepEventLog(s, 'Seasonal illness increased no-show risk.'), reputation: clamp(s.reputation - 0.5, 0, 100) }) },
  { id: 'sports_tournament', name: 'Local Sports Tournament', description: 'Higher athlete demand.', chance: 0.06, apply: (s) => ({ ...s, referrals: s.referrals + 3, reputation: clamp(s.reputation + 1, 0, 100), eventLog: keepEventLog(s, 'Athlete referrals surged.') }) },
  { id: 'ehr_outage', name: 'EHR Outage', description: 'Documentation is delayed.', chance: 0.035, apply: (s) => ({ ...s, backlogDocs: s.backlogDocs + 3, eventLog: keepEventLog(s, 'EHR outage caused a backlog.') }) },
  { id: 'staff_conflict', name: 'Staff Conflict', description: 'Morale drop for the team.', chance: 0.04, apply: (s) => ({ ...s, staff: s.staff.map((m) => ({ ...m, morale: clamp(m.morale - 3, 0, 100) })), eventLog: keepEventLog(s, 'Team morale dipped after conflict.') }) },
  { id: 'equipment_break', name: 'Equipment Breakdown', description: 'Maintenance costs increase.', chance: 0.05, apply: (s) => ({ ...s, equipmentCost: s.equipmentCost + 30, eventLog: keepEventLog(s, 'Equipment breakdown increased costs.') }) },
  { id: 'positive_reviews', name: 'Positive Review Streak', description: 'Boost in referrals and reputation.', chance: 0.09, apply: (s) => ({ ...s, referrals: s.referrals + 2, reputation: clamp(s.reputation + 3, 0, 100), eventLog: keepEventLog(s, 'Great reviews boosted reputation.') }) },
  { id: 'insurer_audit', name: 'Insurer Audit', description: 'Administrative pressure rises.', chance: 0.03, apply: (s) => ({ ...s, backlogDocs: s.backlogDocs + 4, cash: s.cash - 180, eventLog: keepEventLog(s, 'Insurer audit consumed admin time.') }) },
  { id: 'community_fair', name: 'Community Health Fair', description: 'New leads and branding.', chance: 0.08, apply: (s) => ({ ...s, referrals: s.referrals + 3, reputation: clamp(s.reputation + 2, 0, 100), cash: s.cash - 180, eventLog: keepEventLog(s, 'Health fair generated new leads.') }) },
  { id: 'staff_training_day', name: 'Staff Training Day', description: 'Quality up, capacity down briefly.', chance: 0.07, apply: (s) => ({ ...s, staff: s.staff.map((m) => ({ ...m, quality: clamp(m.quality + 0.01, 0, 1), fatigue: clamp(m.fatigue + 3, 0, 100) })), eventLog: keepEventLog(s, 'Training improved care quality.') }) },
  { id: 'rent_review', name: 'Rent Review', description: 'Rent increases slightly.', chance: 0.03, apply: (s) => ({ ...s, rent: s.rent + 20, eventLog: keepEventLog(s, 'Rent increased after review.') }) }
];

export const applyRandomEvent = (state: GameState): GameState => {
  const eventRoll = rand(state.seed + state.day * 13);
  const selectedEvent = EVENT_CARDS.find((_, idx) => eventRoll < EVENT_CARDS.slice(0, idx + 1).reduce((sum, event) => sum + event.chance, 0));
  return selectedEvent ? selectedEvent.apply(state) : state;
};
