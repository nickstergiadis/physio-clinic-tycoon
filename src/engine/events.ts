import { ActiveIncident, GameState, IncidentDecisionOption, IncidentEffect } from '../types/game';
import { clamp, rand } from './utils';

interface IncidentChainDef {
  id: string;
  name: string;
  description: string;
  chance: number;
  duration: [number, number];
  effectsSummary: string;
  ongoingEffects: IncidentEffect;
  triggerPrompt: string;
  triggerOptions: IncidentDecisionOption[];
  resolutionPrompt: string;
  resolutionOptions: IncidentDecisionOption[];
}

const keepEventLog = (state: GameState, line: string): string[] => [`${state.day}: ${line}`, ...state.eventLog].slice(0, 12);

const mergeEffects = (base: IncidentEffect, extra?: IncidentEffect): IncidentEffect => ({
  ...base,
  ...extra,
  modifierPatch: {
    ...(base.modifierPatch ?? {}),
    ...(extra?.modifierPatch ?? {})
  }
});

const applyIncidentEffect = (state: GameState, effect?: IncidentEffect): GameState => {
  if (!effect) return state;
  const moraleShift = effect.moraleShift ?? 0;
  const fatigueShift = effect.fatigueShift ?? 0;
  const note = effect.modifierPatch ? state.operationalModifiers.note : state.operationalModifiers.note;
  return {
    ...state,
    cash: state.cash + (effect.cash ?? 0),
    reputation: clamp(state.reputation + (effect.reputation ?? 0), 0, 100),
    referrals: Math.max(0, state.referrals + (effect.referrals ?? 0)),
    backlogDocs: Math.max(0, state.backlogDocs + (effect.backlogDocs ?? 0)),
    equipmentCost: Math.max(0, state.equipmentCost + (effect.equipmentCost ?? 0)),
    rent: Math.max(0, state.rent + (effect.rent ?? 0)),
    staff: state.staff.map((member) => ({
      ...member,
      morale: clamp(member.morale + moraleShift, 0, 100),
      fatigue: clamp(member.fatigue + fatigueShift, 0, 100)
    })),
    operationalModifiers: {
      ...state.operationalModifiers,
      ...(effect.modifierPatch ?? {}),
      note
    }
  };
};

const applyDailyIncidentEffect = (state: GameState, effect: IncidentEffect): GameState => {
  const patch: IncidentEffect = {
    cash: effect.dailyCash,
    reputation: effect.dailyReputation,
    referrals: effect.dailyReferrals,
    backlogDocs: effect.dailyBacklogDocs,
    moraleShift: effect.dailyMoraleShift,
    fatigueShift: effect.dailyFatigueShift,
    modifierPatch: effect.modifierPatch
  };
  return applyIncidentEffect(state, patch);
};

const makeIncidentId = (state: GameState, chainId: string) => `${chainId}-${state.day}-${Math.floor(rand(state.seed + state.day * 71) * 10000)}`;

const withEventLine = (state: GameState, line: string): GameState => ({ ...state, eventLog: keepEventLog(state, line) });

const INCIDENT_CHAINS: IncidentChainDef[] = [
  {
    id: 'ehr_queue_backlog',
    name: 'EHR Queue Backlog',
    description: 'Claim submissions are stuck and coding tasks pile up.',
    chance: 0.045,
    duration: [2, 4],
    effectsSummary: '+docs backlog, +variable cost pressure',
    ongoingEffects: { dailyBacklogDocs: 1.2, modifierPatch: { variableCostShift: 0.06 } },
    triggerPrompt: 'Billing queue is jamming the front desk. How do you respond?',
    triggerOptions: [
      { id: 'temp_biller', label: 'Hire temp biller', description: 'Pay cash to stabilize claims quickly.', effects: { cash: -240, dailyBacklogDocs: -0.6 } },
      { id: 'defer_claims', label: 'Defer non-urgent claims', description: 'No immediate spend, but docs pressure grows.', effects: { reputation: -0.4 }, addOngoingEffects: { dailyBacklogDocs: 0.4 } }
    ],
    resolutionPrompt: 'Backlog is near control. Closeout approach?',
    resolutionOptions: [
      { id: 'overtime_clear', label: 'Weekend overtime', description: 'Pay overtime to clear backlog now.', effects: { cash: -180, backlogDocs: -2.5, moraleShift: -2 } },
      { id: 'roll_forward', label: 'Carry into next week', description: 'Save cash now, lose confidence.', effects: { reputation: -0.8, backlogDocs: 1 } }
    ]
  },
  {
    id: 'short_notice_sick_leave',
    name: 'Short-Notice Sick Leave',
    description: 'A clinician is out unexpectedly for several days.',
    chance: 0.04,
    duration: [2, 3],
    effectsSummary: '+cancellations, +fatigue risk',
    ongoingEffects: { modifierPatch: { cancellationShift: 0.06 }, dailyFatigueShift: 1.8 },
    triggerPrompt: 'Coverage dropped with no notice. Pick a staffing response.',
    triggerOptions: [
      { id: 'agency_cover', label: 'Agency coverage', description: 'Costly but maintains throughput.', effects: { cash: -220 }, addOngoingEffects: { modifierPatch: { cancellationShift: -0.03 } } },
      { id: 'compress_schedule', label: 'Compress schedule', description: 'Keep costs down but increase misses.', addOngoingEffects: { modifierPatch: { cancellationShift: 0.03 }, dailyFatigueShift: 1.2 } }
    ],
    resolutionPrompt: 'Leave period ends. How do you stabilize the team?',
    resolutionOptions: [
      { id: 'recovery_day', label: 'Give recovery half-day', description: 'Lower burnout after the crunch.', effects: { cash: -70, moraleShift: 3, fatigueShift: -4 } },
      { id: 'normal_roster', label: 'Return to normal roster', description: 'No extra spend, slower morale rebound.', effects: { moraleShift: -1 } }
    ]
  },
  {
    id: 'sterilizer_service_delay',
    name: 'Sterilizer Service Delay',
    description: 'Equipment validation delay is slowing room turnover.',
    chance: 0.035,
    duration: [2, 4],
    effectsSummary: '+variable costs, +cancel risk',
    ongoingEffects: { modifierPatch: { variableCostShift: 0.04, cancellationShift: 0.03 } },
    triggerPrompt: 'Sterilizer checks are overdue. What do you authorize?',
    triggerOptions: [
      { id: 'urgent_vendor', label: 'Urgent vendor dispatch', description: 'High immediate cost, lower disruption.', effects: { cash: -260 }, addOngoingEffects: { modifierPatch: { cancellationShift: -0.02 } } },
      { id: 'manual_protocol', label: 'Manual fallback protocol', description: 'Cheaper but staff workload spikes.', addOngoingEffects: { dailyFatigueShift: 1.5, modifierPatch: { variableCostShift: 0.02 } } }
    ],
    resolutionPrompt: 'Service window completed. Finalize with?',
    resolutionOptions: [
      { id: 'preventive_contract', label: 'Preventive contract', description: 'Reduce future breakdown risk at cost.', effects: { cash: -160, equipmentCost: 8, reputation: 0.4 } },
      { id: 'close_ticket', label: 'Close ticket only', description: 'No additional action.', effects: { reputation: -0.2 } }
    ]
  },
  {
    id: 'insurer_preauth_spike',
    name: 'Pre-Auth Spike',
    description: 'Insurers request extra paperwork before approving sessions.',
    chance: 0.038,
    duration: [3, 5],
    effectsSummary: '-booking conversion, +docs backlog',
    ongoingEffects: { modifierPatch: { bookingShift: -0.05 }, dailyBacklogDocs: 1.1 },
    triggerPrompt: 'Pre-auth workload jumped. Choose an intake policy.',
    triggerOptions: [
      { id: 'strict_triage', label: 'Strict triage', description: 'Filter weak leads and keep docs controlled.', effects: { referrals: -1 }, addOngoingEffects: { modifierPatch: { bookingShift: -0.02 }, dailyBacklogDocs: -0.6 } },
      { id: 'accept_all', label: 'Accept all referrals', description: 'Protect volume, but admin drag worsens.', addOngoingEffects: { dailyBacklogDocs: 0.8, modifierPatch: { variableCostShift: 0.03 } } }
    ],
    resolutionPrompt: 'Insurers relaxed the extra checks. What follow-up?',
    resolutionOptions: [
      { id: 'audit_cleanup', label: 'Audit cleanup sprint', description: 'Clear residual risk quickly.', effects: { cash: -140, backlogDocs: -2, reputation: 0.7 } },
      { id: 'resume_normal', label: 'Resume as-is', description: 'No cleanup investment.', effects: { backlogDocs: 0.8 } }
    ]
  },
  {
    id: 'hvac_hot_zone',
    name: 'HVAC Hot Zone',
    description: 'One treatment area has poor climate control and discomfort complaints.',
    chance: 0.032,
    duration: [2, 3],
    effectsSummary: '+cancellations, -reputation daily',
    ongoingEffects: { modifierPatch: { cancellationShift: 0.04 }, dailyReputation: -0.25 },
    triggerPrompt: 'Temperature complaints are rising. Next step?',
    triggerOptions: [
      { id: 'portable_units', label: 'Rent portable units', description: 'Fast mitigation with rental cost.', effects: { cash: -150 }, addOngoingEffects: { modifierPatch: { cancellationShift: -0.02 } } },
      { id: 'room_shuffle', label: 'Shuffle room assignments', description: 'No cash spend, more operational friction.', addOngoingEffects: { modifierPatch: { bookingShift: -0.03 } } }
    ],
    resolutionPrompt: 'HVAC issue can be closed. Choose post-incident action.',
    resolutionOptions: [
      { id: 'service_tuneup', label: 'Book full tune-up', description: 'Prevents repeat discomfort complaints.', effects: { cash: -110, reputation: 0.5 } },
      { id: 'basic_reset', label: 'Basic reset', description: 'Cheaper with weaker patient confidence.', effects: { reputation: -0.3 } }
    ]
  },
  {
    id: 'transport_strike',
    name: 'Local Transport Disruption',
    description: 'Bus and metro delays disrupt patient arrivals.',
    chance: 0.04,
    duration: [2, 4],
    effectsSummary: '+no-shows, -attendance reliability',
    ongoingEffects: { modifierPatch: { noShowShift: 0.07 } },
    triggerPrompt: 'Patients are calling about delayed transport. What policy do you set?',
    triggerOptions: [
      { id: 'late_grace', label: 'Late-arrival grace windows', description: 'Improve patient goodwill with throughput tradeoff.', effects: { reputation: 0.4 }, addOngoingEffects: { modifierPatch: { bookingShift: -0.03 } } },
      { id: 'tele_triage', label: 'Tele-triage fallback', description: 'Some visits salvaged but staff docs increase.', addOngoingEffects: { modifierPatch: { noShowShift: -0.02 }, dailyBacklogDocs: 0.5 } }
    ],
    resolutionPrompt: 'Transport normalizes. How do you close the policy?',
    resolutionOptions: [
      { id: 'reactivation_push', label: 'Reactivation call list', description: 'Pay front desk overtime to recover missed patients.', effects: { cash: -120, referrals: 1, reputation: 0.4 } },
      { id: 'passive_reopen', label: 'Passive re-open', description: 'No extra action.', effects: { reputation: -0.2 } }
    ]
  },
  {
    id: 'staff_conflict_loop',
    name: 'Scheduling Friction Loop',
    description: 'Repeated shift conflicts are eroding morale.',
    chance: 0.034,
    duration: [3, 4],
    effectsSummary: '-morale, +cancellations',
    ongoingEffects: { dailyMoraleShift: -1.4, modifierPatch: { cancellationShift: 0.04 } },
    triggerPrompt: 'Two core staff are in recurring schedule conflict. Intervene how?',
    triggerOptions: [
      { id: 'mediated_meeting', label: 'Mediated meeting', description: 'Costs time now, better long-term stability.', effects: { cash: -90, moraleShift: 2 }, addOngoingEffects: { dailyMoraleShift: 0.7 } },
      { id: 'manager_decree', label: 'Manager decree', description: 'Quick fix but morale drops.', effects: { moraleShift: -2 }, addOngoingEffects: { modifierPatch: { cancellationShift: 0.02 } } }
    ],
    resolutionPrompt: 'Conflict period is ending. What is the closeout choice?',
    resolutionOptions: [
      { id: 'micro_training', label: 'Team communication workshop', description: 'Small spend to protect morale.', effects: { cash: -130, moraleShift: 3, reputation: 0.3 } },
      { id: 'move_on', label: 'Move on without workshop', description: 'No spend, slight morale scar remains.', effects: { moraleShift: -1 } }
    ]
  },
  {
    id: 'supply_backorder',
    name: 'Brace & Tape Backorder',
    description: 'Consumable stock delays are affecting treatment flow.',
    chance: 0.036,
    duration: [2, 4],
    effectsSummary: '+variable cost, -booking conversion',
    ongoingEffects: { modifierPatch: { variableCostShift: 0.05, bookingShift: -0.03 } },
    triggerPrompt: 'Core supplies are on backorder. Your procurement decision?',
    triggerOptions: [
      { id: 'rush_alt_vendor', label: 'Rush alternate vendor', description: 'More expensive, keeps operations smooth.', effects: { cash: -210 }, addOngoingEffects: { modifierPatch: { bookingShift: 0.02 } } },
      { id: 'ration_stock', label: 'Ration remaining stock', description: 'Save cash now but throughput worsens.', addOngoingEffects: { modifierPatch: { cancellationShift: 0.03 } } }
    ],
    resolutionPrompt: 'Supply chain stabilized. What closeout do you choose?',
    resolutionOptions: [
      { id: 'buffer_inventory', label: 'Build safety stock', description: 'Invest to reduce near-term risk.', effects: { cash: -170, equipmentCost: 6, referrals: 1 } },
      { id: 'lean_inventory', label: 'Keep lean inventory', description: 'No spend but future fragility remains.', effects: { reputation: -0.3 } }
    ]
  },
  {
    id: 'compliance_audit_window',
    name: 'Compliance Audit Window',
    description: 'A district compliance review creates sustained admin pressure.',
    chance: 0.028,
    duration: [3, 5],
    effectsSummary: '+docs backlog, +variable costs',
    ongoingEffects: { dailyBacklogDocs: 1, modifierPatch: { variableCostShift: 0.05 } },
    triggerPrompt: 'Compliance auditor requested expanded logs. How do you prepare?',
    triggerOptions: [
      { id: 'consultant_pack', label: 'Bring compliance consultant', description: 'High cost, lowers audit drag.', effects: { cash: -260 }, addOngoingEffects: { dailyBacklogDocs: -0.5, modifierPatch: { variableCostShift: -0.02 } } },
      { id: 'internal_scramble', label: 'Internal scramble', description: 'No consultant spend; staff strain rises.', addOngoingEffects: { dailyFatigueShift: 1.4 } }
    ],
    resolutionPrompt: 'Audit closes this week. Final action?',
    resolutionOptions: [
      { id: 'document_playbook', label: 'Build compliance playbook', description: 'Codify process for future resilience.', effects: { cash: -150, reputation: 0.9, backlogDocs: -1.8 } },
      { id: 'minimal_close', label: 'Minimal close', description: 'Exit quickly with no process investment.', effects: { reputation: -0.4 } }
    ]
  },
  {
    id: 'new_clinic_competitor',
    name: 'Nearby Competitor Launch',
    description: 'A neighboring clinic opens with aggressive introductory offers.',
    chance: 0.03,
    duration: [3, 5],
    effectsSummary: '-lead flow, pressure on conversion',
    ongoingEffects: { modifierPatch: { leadMultiplier: 0.9, bookingShift: -0.04 } },
    triggerPrompt: 'A competitor launched discount packages nearby. Your response?',
    triggerOptions: [
      { id: 'targeted_outreach', label: 'Targeted outreach campaign', description: 'Spend to defend referrals.', effects: { cash: -220, reputation: 0.5 }, addOngoingEffects: { modifierPatch: { leadMultiplier: 0.08 } } },
      { id: 'hold_margin', label: 'Hold pricing and margin', description: 'Protect cash but lose some leads.', addOngoingEffects: { modifierPatch: { bookingShift: -0.02 } } }
    ],
    resolutionPrompt: 'Launch hype fades. How do you close strategy?',
    resolutionOptions: [
      { id: 'retain_program', label: 'Retention callbacks', description: 'Invest in reactivation and reviews.', effects: { cash: -140, referrals: 2, reputation: 0.8 } },
      { id: 'steady_state', label: 'Return to steady state', description: 'No additional program spend.', effects: { referrals: -1 } }
    ]
  }
];

const rollDuration = (state: GameState, [min, max]: [number, number], salt: number): number => {
  const roll = rand(state.seed + state.day * 53 + salt);
  return min + Math.floor(roll * (max - min + 1));
};

const resolveDefaultOption = (incident: ActiveIncident): IncidentDecisionOption | undefined =>
  incident.pendingDecision?.options.find((option) => option.id === incident.pendingDecision?.defaultOptionId) ?? incident.pendingDecision?.options[0];

export const applyIncidentDecision = (state: GameState, incidentId: string, optionId: string): GameState => {
  const incident = state.activeIncidents.find((entry) => entry.id === incidentId);
  if (!incident || !incident.pendingDecision) return state;
  const option = incident.pendingDecision.options.find((entry) => entry.id === optionId);
  if (!option) return state;

  const baseIncident = {
    ...incident,
    ongoingEffects: mergeEffects(incident.ongoingEffects, option.addOngoingEffects),
    pendingDecision: undefined,
    stage: (incident.pendingDecision.stage === 'trigger' ? 'ongoing' : 'resolution') as ActiveIncident['stage']
  };

  const nextState = applyIncidentEffect({
    ...state,
    activeIncidents: state.activeIncidents.map((entry) => (entry.id === incidentId ? baseIncident : entry))
  }, option.effects);

  return withEventLine(nextState, `${incident.name}: ${option.label}.`);
};

const triggerIncident = (state: GameState, chain: IncidentChainDef, index: number): GameState => {
  const incident: ActiveIncident = {
    id: makeIncidentId(state, chain.id),
    chainId: chain.id,
    name: chain.name,
    description: chain.description,
    startedDay: state.day,
    daysRemaining: rollDuration(state, chain.duration, index),
    stage: 'trigger',
    effectsSummary: chain.effectsSummary,
    ongoingEffects: chain.ongoingEffects,
    pendingDecision: {
      stage: 'trigger',
      prompt: chain.triggerPrompt,
      options: chain.triggerOptions,
      defaultOptionId: chain.triggerOptions[0].id
    }
  };

  const withIncident = withEventLine({ ...state, activeIncidents: [...state.activeIncidents, incident] }, `Incident started: ${chain.name}.`);
  return applyIncidentDecision(withIncident, incident.id, chain.triggerOptions[0].id);
};

const activateResolutionIfNeeded = (incident: ActiveIncident): ActiveIncident => {
  if (incident.daysRemaining > 0 || incident.pendingDecision || incident.stage === 'resolution') return incident;
  const chain = INCIDENT_CHAINS.find((entry) => entry.id === incident.chainId);
  if (!chain) return incident;
  return {
    ...incident,
    stage: 'resolution',
    pendingDecision: {
      stage: 'resolution',
      prompt: chain.resolutionPrompt,
      options: chain.resolutionOptions,
      defaultOptionId: chain.resolutionOptions[0].id
    }
  };
};

export const applyDailyIncidents = (state: GameState): GameState => {
  let next = { ...state, activeIncidents: state.activeIncidents.map((incident) => ({ ...incident })) };

  for (const incident of next.activeIncidents) {
    next = applyDailyIncidentEffect(next, incident.ongoingEffects);
  }

  const activeLines = next.activeIncidents.map((incident) => `${incident.name} (${Math.max(0, incident.daysRemaining)}d)`);
  if (activeLines.length > 0) {
    next.operationalModifiers.note = `Active incidents: ${activeLines.join(', ')}.`;
  }

  INCIDENT_CHAINS.forEach((chain, index) => {
    const alreadyActive = next.activeIncidents.some((incident) => incident.chainId === chain.id);
    if (alreadyActive || next.activeIncidents.length >= 3) return;
    const roll = rand(next.seed + next.day * 97 + index * 13);
    if (roll < chain.chance) {
      next = triggerIncident(next, chain, index + 1);
    }
  });

  return next;
};

export const settleIncidentsAfterDay = (state: GameState): GameState => {
  let next = { ...state, activeIncidents: state.activeIncidents.map((incident) => ({ ...incident })) };

  next.activeIncidents = next.activeIncidents.map((incident) => ({
    ...incident,
    daysRemaining: Math.max(0, incident.daysRemaining - 1)
  })).map((incident) => activateResolutionIfNeeded(incident));

  for (const incident of next.activeIncidents.filter((entry) => entry.pendingDecision?.stage === 'resolution')) {
    const selected = resolveDefaultOption(incident);
    if (selected) {
      next = applyIncidentDecision(next, incident.id, selected.id);
    }
  }

  const resolvedIds = new Set(next.activeIncidents.filter((incident) => incident.stage === 'resolution' && !incident.pendingDecision).map((incident) => incident.id));
  if (resolvedIds.size > 0) {
    const resolvedNames = next.activeIncidents.filter((incident) => resolvedIds.has(incident.id)).map((incident) => incident.name);
    next = withEventLine(next, `Resolved incidents: ${resolvedNames.join(', ')}.`);
    next.activeIncidents = next.activeIncidents.filter((incident) => !resolvedIds.has(incident.id));
  }

  return next;
};
