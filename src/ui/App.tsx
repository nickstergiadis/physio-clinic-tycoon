import { useEffect, useState } from 'react';
import { BUILD_ITEMS, CAMPAIGN_SCENARIOS, DIFFICULTY_PRESETS, ROOM_DEFS, SERVICES, STAFF_TEMPLATES, UPGRADES } from '../data/content';
import {
  assignStaffRoom,
  buyUpgrade,
  fireStaff,
  hireStaff,
  placeRoom,
  placeBuildItem,
  removeRoom,
  removeBuildItem,
  runDay,
  setRoomFocus,
  setStaffShift,
  takeLoan,
  startStaffTraining,
  toggleStaffSchedule,
  upgradeRoomEquipment,
  repayLoan,
  togglePathTile,
  setBookingPolicy,
  chooseIncidentDecision
} from '../engine/simulation';
import { deleteSlot, loadSettings, loadSlots, saveSettings, saveSlot } from '../engine/persistence';
import { addCash, fastForwardDays, setHighNoShowMode, spawnSamplePatients } from '../engine/devTools';
import { createInitialState } from '../engine/state';
import { BookingPolicy, BuildItemId, DaySummary, DifficultyPresetId, GameMode, GameState, RoomTypeId, SaveSlot, ScenarioId, Screen, ServiceId, StaffRoleId, WeeklyReport } from '../types/game';
import { getScenario, objectiveStatus } from '../engine/campaign';
import { formatSignedCurrency, getClinicDrivers, getDemandPressure, getFinanceSnapshot, getStaffInsights } from './dashboard';
import { getBuildItemPlacementError, getItemEffectTotals } from '../engine/buildItems';

const tabs: GameState['selectedTab'][] = ['overview', 'build', 'staff', 'patients', 'finance', 'upgrades'];
const TAB_HELP: Record<GameState['selectedTab'], string> = {
  overview: 'Read yesterday’s results and top drivers before making new investments.',
  build: 'Expand only where bottlenecks exist; new rooms without staff rarely pay back quickly.',
  staff: 'Use shifts + room assignment to reduce bottlenecks before hiring aggressively.',
  patients: 'Track funnel leakage and target upgrades that reduce your largest lost-demand category.',
  finance: 'Watch runway and breakeven gap; protect 2+ weeks runway when possible.',
  upgrades: 'Buy upgrades that solve a concrete issue first (docs, no-shows, or room unlocks).'
};

const ROLE_LABELS: Record<StaffRoleId, string> = {
  physio: 'Physio',
  assistant: 'Assistant',
  frontDesk: 'Front Desk',
  specialist: 'Specialist',
  careCoordinator: 'Care Coord.',
  manualTherapist: 'Manual Tx',
  strengthCoach: 'Strength Coach'
};

const ROOM_ABBR: Record<RoomTypeId, string> = {
  reception: 'REC',
  waiting: 'WAIT',
  treatment: 'TRT',
  gym: 'GYM',
  vestibularLab: 'VEST',
  hydro: 'HYD',
  manualSuite: 'MAN',
  recoveryStudio: 'NEU',
  telehealthPod: 'TEL'
};

const formatDateTime = (timestamp: number) => new Date(timestamp).toLocaleString();
const DEV_PANEL_ENABLED = Boolean(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_PANEL === 'true');

const summarizeUpgradeEffects = (effects: (typeof UPGRADES)[number]['effects']) => {
  const chips: string[] = [];
  if (effects.adminReduction) chips.push(`-${Math.round(effects.adminReduction * 100)}% docs load`);
  if (effects.noShowReduction) chips.push(`-${Math.round(effects.noShowReduction * 100)}% no-shows`);
  if (effects.referralMult) chips.push(`+${Math.round(effects.referralMult * 100)}% referrals`);
  if (effects.qualityBonus) chips.push(`+${Math.round(effects.qualityBonus * 100)}% quality`);
  if (effects.premiumPricing) chips.push(`+${Math.round(effects.premiumPricing * 100)}% pricing`);
  if (effects.moraleGain) chips.push(`+${effects.moraleGain} morale/day impact`);
  if (effects.maxClinicSize) chips.push(`Clinic cap ${effects.maxClinicSize}`);
  if (effects.unlockRooms?.length) chips.push(`Unlock: ${effects.unlockRooms.join(', ')}`);
  return chips.join(' · ') || 'General operational boost';
};

const inferFailureReasons = (state: GameState) => {
  const reasons: string[] = [];
  if (state.cash < -25000 && state.day > 14) reasons.push('Bankruptcy: sustained cash deficits pushed below -$25,000 after week 2.');
  if (state.reputation < 2 && state.day > 20) reasons.push('Reputation collapse: reputation remained critically low into week 3.');
  if (state.fatigueIndex > 0.96 && state.day > 20) reasons.push('Burnout collapse: clinic fatigue exceeded 96% into week 3.');
  return reasons;
};

const getDayMessage = (summary: DaySummary) =>
  `Day ${summary.day}: Leads ${summary.inboundLeads} → Booked ${summary.bookedVisits} → Attended ${summary.attendedVisits} · Profit $${summary.profit}`;

const POLICY_LABELS: Record<BookingPolicy, string> = {
  conservative: 'Conservative',
  balanced: 'Balanced',
  aggressive: 'Aggressive (Overbooked)'
};

const SEVERITY_BADGE: Record<'low' | 'medium' | 'high', string> = {
  low: 'severity-low',
  medium: 'severity-medium',
  high: 'severity-high'
};

const clampPct = (value: number) => Math.max(0, Math.min(100, value));

const getCoachingPriorities = (state: GameState): string[] => {
  const tips: string[] = [];
  if (!state.latestSummary) {
    tips.push('Run your first day to unlock diagnostics and baseline demand.');
    tips.push('Make only one change after day 1 so you can observe its impact clearly.');
    return tips;
  }
  if (!state.staff.some((s) => s.scheduled && s.role !== 'frontDesk')) tips.push('Schedule at least one clinician; front desk alone cannot treat patients.');
  if (state.latestSummary.lostDemand.capacity > Math.max(4, state.latestSummary.attendedVisits * 0.35)) tips.push('Capacity loss is high: add one staff shift/room or switch booking policy to Balanced.');
  if (state.latestSummary.lostDemand.noShows + state.latestSummary.lostDemand.cancellations > Math.max(3, state.latestSummary.bookedVisits * 0.3)) tips.push('No-shows and cancellations are leaking demand. Prioritize online booking or telehealth continuity upgrades.');
  if (state.backlogDocs > 10) tips.push('Documentation backlog is expensive. Add admin capacity or EHR-focused upgrades before expanding.');
  if (state.cash < 5000) tips.push('Cash cushion is thin. Pause expansion and target stable positive days first.');
  if (!tips.length) tips.push('System health is stable—scale one bottleneck at a time to protect consistency.');
  return tips.slice(0, 3);
};

const TrendChart = ({ label, points, color, format }: { label: string; points: number[]; color: string; format: (value: number) => string }) => {
  if (!points.length) return <small>Run several days to unlock trend history.</small>;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const spread = Math.max(1, max - min);
  const latest = points[points.length - 1];
  return (
    <div className="trend-chart" aria-label={`${label} trend`}>
      <div className="row">
        <strong>{label}</strong>
        <small>{format(latest)} latest</small>
      </div>
      <div className="trend-bars">
        {points.slice(-21).map((value, idx) => (
          <span
            key={`${label}-${idx}`}
            className="trend-bar"
            style={{ height: `${Math.max(8, ((value - min) / spread) * 60 + 8)}px`, background: color }}
            title={`${label}: ${format(value)}`}
          />
        ))}
      </div>
    </div>
  );
};

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [state, setState] = useState<GameState | null>(null);
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [selectedBuildRoom, setSelectedBuildRoom] = useState<RoomTypeId | 'path' | BuildItemId | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>('community_rebuild');
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyPresetId>('standard');
  const [actionMessage, setActionMessage] = useState<string>('');
  const [diagnosticFocus, setDiagnosticFocus] = useState<string | null>(null);

  useEffect(() => {
    setSlots(loadSlots());
  }, []);

  useEffect(() => {
    if (!actionMessage) return;
    const id = window.setTimeout(() => setActionMessage(''), 3000);
    return () => clearTimeout(id);
  }, [actionMessage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!state || screen !== 'inGame') return;
      if (event.key === ' ') {
        event.preventDefault();
        setState((prev) => (prev ? { ...prev, paused: !prev.paused, speed: prev.paused ? (Math.max(prev.speed, 1) as GameState['speed']) : 0 } : prev));
      }
      if (event.key >= '1' && event.key <= '6') {
        const idx = Number(event.key) - 1;
        setState((prev) => (prev ? { ...prev, selectedTab: tabs[idx] ?? prev.selectedTab } : prev));
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, state]);

  useEffect(() => {
    if (!state || screen !== 'inGame' || state.paused || state.speed === 0 || state.gameOver || state.gameWon) return;
    const ms = state.speed === 1 ? 2000 : state.speed === 2 ? 1200 : 700;
    const id = window.setInterval(() => {
      setState((prev) => {
        if (!prev) return prev;
        const next = runDay(prev);
        if (next.latestSummary && next.latestSummary.day !== prev.latestSummary?.day) {
          setActionMessage(getDayMessage(next.latestSummary));
        }
        return next;
      });
    }, ms);
    return () => clearInterval(id);
  }, [screen, state?.paused, state?.speed, state?.gameOver, state?.gameWon]);

  const startGame = (mode: GameMode) => {
    const initial = createInitialState(mode, selectedScenario, selectedDifficulty);
    initial.settings = loadSettings();
    setState(initial);
    setSelectedBuildRoom('treatment');
    setActionMessage('Welcome! Run day 1, then either add a room or hire one staff member.');
    setScreen('inGame');
  };

  const cloneState = (source: GameState): GameState => JSON.parse(JSON.stringify(source)) as GameState;

  const continueLatest = () => {
    const newest = [...slots].sort((a, b) => b.timestamp - a.timestamp)[0];
    if (!newest) return;
    setState(cloneState(newest.state));
    setScreen('inGame');
    setActionMessage(`Loaded ${newest.label}.`);
  };

  if (screen === 'menu') {
    const newest = [...slots].sort((a, b) => b.timestamp - a.timestamp)[0];
    return (
      <div className="shell menu">
        <div className="menu-hero panel">
          <p className="kicker">Management Simulation</p>
          <h1>PHYSIOTHERAPY CLINIC TYCOON</h1>
          <p className="subtitle">Build a thriving rehab business. Balance outcomes, capacity, morale, and cashflow.</p>
          <div className="hero-tags">
            <span>Clinic Ops</span>
            <span>Staff Strategy</span>
            <span>Financial Pressure</span>
          </div>
        </div>
        <div className="menu-actions panel">
          <button onClick={() => setScreen('newGame')}>New Game</button>
          <button disabled={!newest} onClick={continueLatest} title={!newest ? 'No save found yet' : `Load ${newest.label}`}>Continue Latest Save</button>
          <button onClick={() => setScreen('loadGame')}>Load / Manage Saves</button>
          <button onClick={() => setScreen('tutorial')}>How to Play (2 min)</button>
          <button onClick={() => setScreen('settings')}>Settings</button>
        </div>
        {newest && <p className="subtitle menu-latest">Latest save: {newest.label} · {formatDateTime(newest.timestamp)}</p>}
      </div>
    );
  }

  if (screen === 'newGame') {
    const selectedScenarioDef = getScenario(selectedScenario);
    return (
      <div className="shell panel menu-screen">
        <h2>Choose Play Mode</h2>
        <div className="grid-2">
          <button onClick={() => startGame('campaign')}>
            <strong>Campaign (Goal-driven)</strong>
            <span>Scenario objectives, financing pressure, and tier unlock progression.</span>
          </button>
          <button onClick={() => startGame('sandbox')}>
            <strong>Sandbox (Creative)</strong>
            <span>Start with $45,000 and no win/fail pressure. Good for experimenting with layouts/upgrades.</span>
          </button>
        </div>
        <div className="row">
          <label>
            Scenario:&nbsp;
            <select value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value as ScenarioId)}>
              {Object.values(CAMPAIGN_SCENARIOS).map((scenario) => (
                <option key={scenario.id} value={scenario.id}>{scenario.name}</option>
              ))}
            </select>
          </label>
          <label>
            Difficulty:&nbsp;
            <select value={selectedDifficulty} onChange={(event) => setSelectedDifficulty(event.target.value as DifficultyPresetId)}>
              {DIFFICULTY_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="subtitle">{selectedScenarioDef.description}</p>
        <button className="ghost" onClick={() => setScreen('menu')}>Back</button>
      </div>
    );
  }

  if (screen === 'loadGame') {
    return (
      <div className="shell panel menu-screen">
        <h2>Load / Manage Saves</h2>
        {!slots.length && <p>No save slots found. Start a new game and press Save in the HUD.</p>}
        {slots.map((slot) => (
          <div key={slot.id} className="row card">
            <div>
              <strong>{slot.label}</strong>
              <div>Week {slot.state.week} · Day {slot.state.day} · Cash ${Math.round(slot.state.cash)} · Rep {slot.state.reputation.toFixed(0)}</div>
              <small>{formatDateTime(slot.timestamp)}</small>
            </div>
            <div className="row">
              <button onClick={() => { setState(cloneState(slot.state)); setScreen('inGame'); setActionMessage(`Loaded ${slot.label}.`); }}>Load</button>
              <button className="danger" onClick={() => setSlots(deleteSlot(slot.id))}>Delete</button>
            </div>
          </div>
        ))}
        <button className="ghost" onClick={() => setScreen('menu')}>Back</button>
      </div>
    );
  }

  if (screen === 'tutorial') {
    return (
      <div className="shell panel menu-screen">
        <h2>Quick Onboarding (under 2 minutes)</h2>
        <ol>
          <li><strong>Press Advance Day once.</strong> This gives baseline demand, profit, and risk flags.</li>
          <li><strong>Fix bottlenecks first:</strong> no clinician scheduled, high docs backlog, or low cash runway.</li>
          <li><strong>One growth move/day:</strong> add one room, hire one role, or buy one upgrade with a clear reason.</li>
          <li><strong>Check End-of-day summary</strong> and react to notes before speeding up.</li>
        </ol>
        <p>Keyboard: space = pause/resume, keys 1-6 switch tabs.</p>
        <div className="row">
          <button onClick={() => startGame('campaign')}>Start Campaign</button>
          <button className="ghost" onClick={() => setScreen('menu')}>Back</button>
        </div>
      </div>
    );
  }

  if (screen === 'settings') {
    const settings = state?.settings ?? loadSettings();
    return (
      <div className="shell panel menu-screen">
        <h2>Settings</h2>
        <label><input type="checkbox" checked={settings.soundEnabled} onChange={(e) => {
          const next = { ...settings, soundEnabled: e.target.checked };
          saveSettings(next);
          if (state) setState({ ...state, settings: next });
        }} /> Sound effects</label>
        <label><input type="checkbox" checked={settings.ambientEnabled} onChange={(e) => {
          const next = { ...settings, ambientEnabled: e.target.checked };
          saveSettings(next);
          if (state) setState({ ...state, settings: next });
        }} /> Ambient loop</label>
        <label><input type="checkbox" checked={settings.showTutorialHints} onChange={(e) => {
          const next = { ...settings, showTutorialHints: e.target.checked };
          saveSettings(next);
          if (state) setState({ ...state, settings: next });
        }} /> Show tutorial hints</label>
        <button onClick={() => setScreen('menu')}>Back</button>
      </div>
    );
  }

  if (!state) return null;

  const saveToSlot = (slotNum: 1 | 2 | 3) => {
    const slotId = `slot-${slotNum}`;
    const label = `${state.mode.toUpperCase()} W${state.week} D${state.day}`;
    const updated = saveSlot(slotId, label, state);
    setSlots(updated);
    setActionMessage(`Saved to slot ${slotNum} (${label}).`);
  };

  const availableUpgrades = UPGRADES.filter((u) => !state.unlockedUpgrades.includes(u.id)).sort((a, b) => Number(state.cash < a.cost) - Number(state.cash < b.cost) || a.cost - b.cost);

  // Keep derived values as plain constants so no hook is declared below conditional returns.
  const campaignProgress = (() => {
    if (state.mode !== 'campaign') return null;
    const scenario = getScenario(state.scenarioId);
    const trackedObjectives = objectiveStatus(state);
    return {
      scenarioName: scenario.name,
      startingLoanOffer: scenario.startingLoanOffer,
      week: `${state.week}/${state.campaignGoal.targetWeek}`,
      rep: `${state.reputation.toFixed(0)}/${state.campaignGoal.targetReputation}`,
      cash: `${Math.round(state.cash)}/${state.campaignGoal.targetCash}`,
      objectives: trackedObjectives
    };
  })();

  const onboardingChecklist = [
    { done: Boolean(state.latestSummary), label: 'Run your first day' },
    { done: state.rooms.length >= 5 || state.staff.length >= 4, label: 'Add one room or hire one staff member' },
    { done: state.unlockedUpgrades.length > 0, label: 'Buy your first upgrade' },
    { done: state.latestSummary ? state.latestSummary.profit > 0 : false, label: 'Finish a profitable day' }
  ];

  const clinicianScheduled = state.staff.some((s) =>
    s.scheduled && (s.role === 'physio' || s.role === 'assistant' || s.role === 'specialist' || s.role === 'manualTherapist' || s.role === 'strengthCoach')
  );
  const emptyTiles = state.maxClinicSize - state.rooms.length;
  const itemEffects = getItemEffectTotals(state);
  const isItemTool = selectedBuildRoom ? BUILD_ITEMS.some((item) => item.id === selectedBuildRoom) : false;
  const assignableRoomTypes = [...new Set(state.rooms.map((room) => room.type))];
  const financeSnapshot = getFinanceSnapshot(state);
  const staffInsights = getStaffInsights(state);
  const demandPressure = getDemandPressure(state.latestSummary);
  const clinicDrivers = getClinicDrivers(state);
  const topServiceLines = state.latestSummary?.serviceLinePerformance ?? [];
  const bestServiceLines = topServiceLines.filter((line) => line.attended > 0).slice(0, 3);
  const worstServiceLines = [...topServiceLines].sort((a, b) => (b.failures - b.attended * 0.4) - (a.failures - a.attended * 0.4)).slice(0, 3);
  const latestWeeklyReport = state.weeklyReports[state.weeklyReports.length - 1];
  const coachingPriorities = getCoachingPriorities(state);

  const alerts: string[] = [];
  if (!clinicianScheduled) alerts.push('No clinician is scheduled. You will treat 0 patients.');
  if (state.backlogDocs > 10) alerts.push('Documentation backlog is costing penalties. Prioritize admin capacity or EHR upgrade.');
  if (state.fatigueIndex > 0.7) alerts.push('Fatigue risk is high. Consider unscheduling or wellness upgrades.');
  if (state.cash < 0) alerts.push('You are in negative cash. Cut costs or raise throughput immediately.');

  return (
    <div className="shell game tycoon-theme">
      <header className="hud">
        <div className="hud-main">
          <div>
            <p className="kicker">Clinic Operations Command</p>
            <h2>Physiotherapy Clinic Tycoon</h2>
          </div>
          <div className="hud-meta">Day <strong>{state.day}</strong> · Week <strong>{state.week}</strong> · Mode <span className="mode-pill">{state.mode}</span></div>
        </div>
        <div className="hud-stats">
          <div className="hud-stat stat-cash" title="Cash available for payroll, rent and expansion"><span>Cash</span><strong>${Math.round(state.cash)}</strong></div>
          <div className="hud-stat stat-rep" title="Impacts referrals and premium pricing"><span>Reputation</span><strong>{state.reputation.toFixed(0)}</strong></div>
          <div className="hud-stat" title="Projected incoming patient volume"><span>Referrals</span><strong>{state.referrals}</strong></div>
          <div className="hud-stat stat-risk" title="Clinic-wide fatigue risk"><span>Fatigue</span><strong>{(state.fatigueIndex * 100).toFixed(0)}%</strong></div>
          <div className="hud-stat stat-risk" title="Unfinished documentation creates penalties"><span>Docs Backlog</span><strong>{state.backlogDocs.toFixed(1)}</strong></div>
        </div>
        {alerts.length > 0 && <div className="alert-strip">Priority: {alerts[0]}</div>}
        {!!actionMessage && <div className="status-banner">{actionMessage}</div>}
        <div className="row hud-controls">
          <div className="control-group">
            <button onClick={() => setState({ ...state, paused: !state.paused, speed: state.paused ? (Math.max(state.speed, 1) as GameState['speed']) : 0 })}>{state.paused ? '▶ Resume' : '⏸ Pause'}</button>
            <button className={state.speed === 1 && !state.paused ? 'speed-active' : ''} onClick={() => setState({ ...state, speed: 1, paused: false })}>1x</button>
            <button className={state.speed === 2 && !state.paused ? 'speed-active' : ''} onClick={() => setState({ ...state, speed: 2, paused: false })}>2x</button>
            <button className={state.speed === 3 && !state.paused ? 'speed-active' : ''} onClick={() => setState({ ...state, speed: 3, paused: false })}>3x</button>
            <button onClick={() => {
              const next = runDay(state);
              setState(next);
              if (next.latestSummary) setActionMessage(getDayMessage(next.latestSummary));
            }}>Advance Day</button>
          </div>
          <div className="control-group">
            <button onClick={() => saveToSlot(1)}>Save 1</button>
            <button onClick={() => saveToSlot(2)}>Save 2</button>
            <button onClick={() => saveToSlot(3)}>Save 3</button>
            <button className="ghost" onClick={() => setScreen('menu')}>Main Menu</button>
          </div>
        </div>
        {DEV_PANEL_ENABLED && (
          <div className="card compact" style={{ marginTop: 8 }}>
            <strong>Developer Controls</strong>
            <div className="row" style={{ marginTop: 6 }}>
              <button onClick={() => { const next = addCash(state, 5000); setState(next); setActionMessage('DEV: +$5,000 added.'); }}>Add Cash +$5k</button>
              <button onClick={() => { const next = fastForwardDays(state, 7); setState(next); if (next.latestSummary) setActionMessage(`DEV: Fast-forwarded to day ${next.latestSummary.day}.`); }}>Fast-forward 7d</button>
              <button onClick={() => { const next = fastForwardDays(state, 30); setState(next); if (next.latestSummary) setActionMessage(`DEV: Fast-forwarded to day ${next.latestSummary.day}.`); }}>Fast-forward 30d</button>
              <button onClick={() => { const next = spawnSamplePatients(state); setState(next); setActionMessage('DEV: Spawned sample patients.'); }}>Spawn Sample Patients</button>
              <button onClick={() => { const enabled = !(state.dev?.highNoShowMode ?? false); const next = setHighNoShowMode(state, enabled); setState(next); setActionMessage(`DEV: High no-show mode ${enabled ? 'enabled' : 'disabled'}.`); }}>
                High No-Show: {(state.dev?.highNoShowMode ?? false) ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        )}
      </header>

      <nav className="tabs">
        {tabs.map((tab, index) => (
          <button key={tab} className={state.selectedTab === tab ? 'active' : ''} onClick={() => setState({ ...state, selectedTab: tab })}>
            {index + 1}. {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>
      <div className="tab-helper">{TAB_HELP[state.selectedTab]}</div>
      {state.settings.showTutorialHints && (
        <div className="hint-box">
          <strong>Coach priorities</strong>
          <ul>
            {coachingPriorities.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </div>
      )}

      <main className="content">
        {state.selectedTab === 'overview' && (
          <section className="grid-2 section-overview">
            <article className="card card-overview">
              <h3>Operations Snapshot</h3>
              <p>Rooms: {state.rooms.length}/{state.maxClinicSize}</p>
              <p>Staff scheduled: {state.staff.filter((s) => s.scheduled).length}/{state.staff.length}</p>
              <p>Booked visits in pipeline: {state.patientQueue.length}</p>
              <p>Booking policy: <strong>{POLICY_LABELS[state.bookingPolicy]}</strong></p>
              <p>Utilization (latest day): {state.demandSnapshot.utilization.toFixed(1)}%</p>
              {state.activeIncidents.length > 0 && (
                <div className="summary-box">
                  <h4>Active Incidents</h4>
                  {state.activeIncidents.map((incident) => (
                    <div key={incident.id} className="incident-card">
                      <strong>{incident.name}</strong>
                      <small>{incident.description}</small>
                      <small>Timer: {incident.daysRemaining} day(s) remaining · Effect: {incident.effectsSummary}</small>
                      {incident.pendingDecision && (
                        <div className="incident-decision">
                          <small><strong>Decision:</strong> {incident.pendingDecision.prompt}</small>
                          <div className="row">
                            {incident.pendingDecision.options.map((option) => (
                              <button
                                key={`${incident.id}-${option.id}`}
                                className="ghost"
                                onClick={() => {
                                  const next = chooseIncidentDecision(state, incident.id, option.id);
                                  setState(next);
                                  setActionMessage(`${incident.name}: ${option.label}`);
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!clinicianScheduled && <p className="warn">⚠ No clinician scheduled. Patients cannot be treated.</p>}
              {state.settings.showTutorialHints && state.week <= 2 && (
                <div className="hint-box">
                  <h4>First 5-Minute Checklist</h4>
                  <ul>
                    {onboardingChecklist.map((item) => <li key={item.label}>{item.done ? '✅' : '⬜'} {item.label}</li>)}
                  </ul>
                </div>
              )}
              {state.latestSummary && (
                <div className="summary-box">
                  <h4>End-of-Day Feedback</h4>
                  <p>Revenue ${state.latestSummary.revenue} · Expenses ${state.latestSummary.expenses} · Profit {formatSignedCurrency(state.latestSummary.profit)}</p>
                  <p>Leads {state.latestSummary.inboundLeads} → Booked {state.latestSummary.bookedVisits} → Attended {state.latestSummary.attendedVisits} ({state.latestSummary.utilization.toFixed(1)}% utilization)</p>
                  <p>Lost: unbooked {state.latestSummary.lostDemand.unbooked}, capacity {state.latestSummary.lostDemand.capacity}, cancellations {state.latestSummary.lostDemand.cancellations}, no-shows {state.latestSummary.lostDemand.noShows}</p>
                  <p>Bottlenecks: staff {state.latestSummary.bottlenecks.staffing}, rooms {state.latestSummary.bottlenecks.room}, equipment {state.latestSummary.bottlenecks.equipment}, burnout pressure {state.latestSummary.bottlenecks.burnout}</p>
                  {state.latestSummary.notes.length > 0 && (
                    <ul>
                      {state.latestSummary.notes.map((note) => <li key={note}>{note}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </article>
            <article className="card card-diagnostics">
              <h3>Why you are winning / struggling</h3>
              <div className="insight-list">
                {clinicDrivers.map((driver) => (
                  <div key={driver.label} className={`insight-row tone-${driver.tone}`}>
                    <strong>{driver.label}</strong>
                    <small>{driver.detail}</small>
                  </div>
                ))}
              </div>
              {state.latestSummary && (
                <>
                  <h3>Top Clinic Issues</h3>
                  <div className="insight-list">
                    {state.latestSummary.topComplaints.map((issue) => (
                      <button
                        key={`${issue.category}-${issue.reason}`}
                        className={`insight-row tone-negative ${SEVERITY_BADGE[issue.severity]}`}
                        onClick={() => setDiagnosticFocus(issue.category)}
                        title="Drill down this issue"
                      >
                        <strong>{issue.label}</strong>
                        <small>{issue.reason}</small>
                      </button>
                    ))}
                    {state.latestSummary.topComplaints.length === 0 && <small>No major issues flagged from simulation inputs.</small>}
                  </div>
                  <h3>Top Positive Drivers</h3>
                  <div className="insight-list">
                    {state.latestSummary.topPositives.map((driver) => (
                      <button
                        key={`${driver.category}-${driver.reason}`}
                        className={`insight-row tone-positive ${SEVERITY_BADGE[driver.severity]}`}
                        onClick={() => setDiagnosticFocus(driver.category)}
                        title="Drill down this driver"
                      >
                        <strong>{driver.label}</strong>
                        <small>{driver.reason}</small>
                      </button>
                    ))}
                  </div>
                  <div className="grid-2">
                    <div className="summary-box">
                      <h4>Most Profitable Service Lines</h4>
                      {bestServiceLines.map((line) => (
                        <button key={`best-${line.serviceId}`} className={`service-line-chip status-${line.status}`} onClick={() => setDiagnosticFocus(line.serviceId)}>
                          <strong>{line.label}</strong>
                          <small>Profit {formatSignedCurrency(line.profit)} · Margin {line.marginPct}% · Visits {line.attended}</small>
                        </button>
                      ))}
                      {bestServiceLines.length === 0 && <small>Run more days to establish service profitability trends.</small>}
                    </div>
                    <div className="summary-box">
                      <h4>Most Problematic Service Lines</h4>
                      {worstServiceLines.map((line) => (
                        <button key={`worst-${line.serviceId}`} className={`service-line-chip status-${line.status}`} onClick={() => setDiagnosticFocus(line.serviceId)}>
                          <strong>{line.label}</strong>
                          <small>Failures {line.failures} · Outcome {Math.round(line.avgOutcome * 100)}% · Profit {formatSignedCurrency(line.profit)}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <h3>Historical Trends (last 3 weeks)</h3>
                  <div className="grid-2">
                    <TrendChart label="Daily Profit" points={state.dailyTrends.map((point) => point.profit)} color="#2f9e68" format={(value) => formatSignedCurrency(Math.round(value))} />
                    <TrendChart label="Utilization" points={state.dailyTrends.map((point) => clampPct(point.utilization))} color="#277da1" format={(value) => `${Math.round(value)}%`} />
                    <TrendChart label="Reputation" points={state.dailyTrends.map((point) => clampPct(point.reputation))} color="#7b5abf" format={(value) => `${value.toFixed(0)}`} />
                    <TrendChart label="Cash" points={state.dailyTrends.map((point) => point.cash)} color="#f2a541" format={(value) => `$${Math.round(value)}`} />
                  </div>
                  <h3>Weekly Reports</h3>
                  {state.weeklyReports.length === 0 && <small>First report is generated at the end of week 1.</small>}
                  <div className="insight-list">
                    {[...state.weeklyReports].reverse().slice(0, 4).map((report: WeeklyReport) => (
                      <div key={`report-${report.week}-${report.endDay}`} className={`insight-row ${report.profit >= 0 ? 'tone-positive' : 'tone-negative'}`}>
                        <strong>Week {report.week} (Days {report.startDay}-{report.endDay}) · Profit {formatSignedCurrency(report.profit)}</strong>
                        <small>Revenue ${report.revenue} · Expenses ${report.expenses} · Attended {report.attendedVisits} · No-shows {report.noShows}</small>
                        <small>Avg utilization {report.avgUtilization}% · Avg wait {report.avgWait}m · Avg outcome {Math.round(report.avgOutcome * 100)}%</small>
                        <small><strong>Top risk:</strong> {report.topRisk}</small>
                        <small><strong>Coach tip:</strong> {report.coachingTip}</small>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <h3>Event Log</h3>
              <ul>
                {state.eventLog.length === 0 && <li>No events recorded yet.</li>}
                {state.eventLog.map((line, idx) => <li key={`${idx}-${line}`}>{line}</li>)}
              </ul>
              {campaignProgress && (
                <div className="campaign-box">
                  <h4>Campaign Goal ({campaignProgress.scenarioName})</h4>
                  <p>Week {campaignProgress.week}</p>
                  <p>Reputation {campaignProgress.rep}</p>
                  <p>Cash {campaignProgress.cash}</p>
                  <p>District tier: {state.districtTier}</p>
                  <ul>
                    {campaignProgress.objectives.map((objective) => (
                      <li key={objective.id}>
                        {objective.completed ? '✅' : '⬜'} {objective.label} ({typeof objective.value === 'number' ? objective.value.toFixed(objective.metric === 'avgOutcome' ? 2 : 0) : objective.value}/{objective.target}) by week {objective.deadlineWeek}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          </section>
        )}

        {state.selectedTab === 'build' && (
          <section className="grid-2 section-build">
            <article className="card card-build-grid">
              <h3>Layout (6x6)</h3>
              <p>Capacity left: <strong>{emptyTiles}</strong> room slots. Select a room, item, or path tool, then click tiles to shape flow.</p>
              <div className="layout-grid">
                {Array.from({ length: 36 }).map((_, i) => {
                  const x = i % 6;
                  const y = Math.floor(i / 6);
                  const room = state.rooms.find((r) => r.x === x && r.y === y);
                  const isPath = state.pathTiles.some((tile) => tile.x === x && tile.y === y);
                  const tileItems = state.placedItems.filter((item) => item.x === x && item.y === y);
                  const heat = state.latestSummary?.layoutFlow?.heatmap.find((cell) => cell.x === x && cell.y === y)?.load ?? 0;
                  return (
                    <button
                      key={`${x}-${y}`}
                      className={`cell ${room ? 'filled' : ''} ${isPath ? 'path-tile' : ''}`}
                      title={room ? `${room.type}${tileItems.length ? ` · items ${tileItems.length}` : ''}` : selectedBuildRoom === 'path' ? (isPath ? 'Remove path tile' : 'Paint path tile') : selectedBuildRoom ? `Place ${selectedBuildRoom}` : 'Select a room/item first'}
                      onClick={() => {
                        if (isItemTool) {
                          const next = placeBuildItem(state, selectedBuildRoom as BuildItemId, x, y);
                          setState(next);
                          const reason = getBuildItemPlacementError(state, selectedBuildRoom as BuildItemId, x, y);
                          setActionMessage(next === state ? (reason ?? 'Cannot place item here.') : `Placed ${selectedBuildRoom}.`);
                          return;
                        }
                        if (room) {
                          const next = removeRoom(state, room.id);
                          setState(next);
                          if (next !== state) setActionMessage(`Removed ${room.type}.`);
                          else setActionMessage('Cannot remove the last required core room of that type.');
                          return;
                        }
                        if (!selectedBuildRoom) {
                          setActionMessage('Select a room or item first.');
                          return;
                        }
                        if (selectedBuildRoom === 'path') {
                          const next = togglePathTile(state, x, y);
                          setState(next);
                          setActionMessage(next === state ? 'Cannot place path on an occupied room tile.' : (isPath ? 'Removed path tile.' : 'Added path tile.'));
                          return;
                        }
                        const next = placeRoom(state, selectedBuildRoom as RoomTypeId, x, y);
                        setState(next);
                        setActionMessage(next === state ? 'Cannot place room here (locked, full, occupied, path tile, or insufficient cash).' : `Placed ${selectedBuildRoom}.`);
                      }}
                    >
                      <span style={{ opacity: heat > 0 ? Math.max(0.28, heat) : 1 }}>{room ? ROOM_ABBR[room.type] : isPath ? '·' : '+'}</span>
                      {tileItems.length > 0 && <small className="cell-item-count">{tileItems.length}</small>}
                    </button>
                  );
                })}
              </div>
            </article>
            <article className="card card-build-tools">
              <h3>Build Tools</h3>
              <button
                className={`build-option ${selectedBuildRoom === 'path' ? 'active' : ''}`}
                onClick={() => setSelectedBuildRoom('path')}
                title="Paint walkable hallway tiles"
              >
                <span>
                  <strong>Path Tool</strong>
                  <small>Paint walkable tiles between reception, waiting, and treatment zones.</small>
                </span>
                <span>{selectedBuildRoom === 'path' ? 'Selected' : 'Select'}</span>
              </button>
              <h4>Rooms</h4>
              {ROOM_DEFS.map((room) => {
                const unlocked = state.unlockedRooms.includes(room.id);
                const affordable = state.cash >= room.cost;
                return (
                  <button
                    key={room.id}
                    className={`build-option ${selectedBuildRoom === room.id ? 'active' : ''}`}
                    disabled={!unlocked}
                    onClick={() => setSelectedBuildRoom(room.id as RoomTypeId)}
                    title={!unlocked ? 'Locked by upgrade' : !affordable ? 'Insufficient cash' : 'Select for placement'}
                  >
                    <span>
                      <strong>{room.name}</strong>
                      <small>${room.cost} · maintenance ${room.maintenance}/day · throughput +{Math.round(room.throughputBonus * 100)}% · equipment synergy</small>
                    </span>
                    <span>{!unlocked ? 'Locked' : !affordable ? 'Too Expensive' : 'Select'}</span>
                  </button>
                );
              })}
              <h4>Placeable Items</h4>
              {BUILD_ITEMS.map((item) => {
                const affordable = state.cash >= item.cost;
                const itemEffectsSummary = [
                  item.effects.waitingComfort ? `Wait +${Math.round(item.effects.waitingComfort * 100)}%` : '',
                  item.effects.wayfinding ? `Wayfinding +${Math.round(item.effects.wayfinding * 100)}%` : '',
                  item.effects.adminEfficiency ? `Admin +${Math.round(item.effects.adminEfficiency * 100)}%` : '',
                  item.effects.treatmentQuality ? `Quality +${Math.round(item.effects.treatmentQuality * 100)}%` : '',
                  item.effects.moraleRecovery ? `Morale +${Math.round(item.effects.moraleRecovery * 100)}%` : ''
                ].filter(Boolean).join(' · ');
                return (
                  <button
                    key={item.id}
                    className={`build-option ${selectedBuildRoom === item.id ? 'active' : ''}`}
                    disabled={!affordable}
                    onClick={() => setSelectedBuildRoom(item.id)}
                    title={!affordable ? 'Insufficient cash' : item.description}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>${item.cost} · maintenance ${item.maintenance}/day · {itemEffectsSummary || 'Operational boost'}</small>
                      <small>{item.description}</small>
                    </span>
                    <span>{!affordable ? 'Too Expensive' : 'Select'}</span>
                  </button>
                );
              })}
              <h4>Item bonus totals</h4>
              <div className="summary-box">
                <p>Waiting comfort +{Math.round(itemEffects.waitingComfort * 100)}% · Wayfinding +{Math.round(itemEffects.wayfinding * 100)}%</p>
                <p>Admin efficiency +{Math.round(itemEffects.adminEfficiency * 100)}% · Treatment quality +{Math.round(itemEffects.treatmentQuality * 100)}%</p>
                <p>Morale/fatigue recovery +{Math.round(itemEffects.moraleRecovery * 100)}%</p>
              </div>
              <h4>Placed items</h4>
              {state.placedItems.length === 0 && <p><small>No placeable items installed yet.</small></p>}
              {state.placedItems.map((placed) => {
                const itemDef = BUILD_ITEMS.find((item) => item.id === placed.itemId);
                return (
                  <div key={placed.id} className="row card compact">
                    <div>
                      <strong>{itemDef?.name ?? placed.itemId}</strong>
                      <div><small>Tile ({placed.x}, {placed.y}) · maintenance ${itemDef?.maintenance ?? 0}/day</small></div>
                    </div>
                    <button className="danger" onClick={() => setState(removeBuildItem(state, placed.id))}>Remove</button>
                  </div>
                );
              })}
              <h4>Flow diagnostics</h4>
              {state.latestSummary?.layoutFlow ? (
                <div className="summary-box">
                  <p>Avg travel: {state.latestSummary.layoutFlow.avgTravelTiles.toFixed(1)} tiles · congestion {state.latestSummary.layoutFlow.congestionIndex.toFixed(2)}</p>
                  <p>Flow penalties: +{state.latestSummary.layoutFlow.waitPenaltyMinutes} min wait · throughput x{state.latestSummary.layoutFlow.throughputMultiplier.toFixed(2)} · staff x{state.latestSummary.layoutFlow.staffEfficiencyMultiplier.toFixed(2)}</p>
                  {state.latestSummary.layoutFlow.warnings.length > 0 && (
                    <ul>
                      {state.latestSummary.layoutFlow.warnings.map((warning) => <li key={warning}>⚠ {warning}</li>)}
                    </ul>
                  )}
                </div>
              ) : (
                <p><small>Run one day to see path and congestion heatmap overlay.</small></p>
              )}
              <h4>Facility operations</h4>
              {state.rooms.map((room) => (
                <div key={room.id} className="row card compact">
                  <div>
                    <strong>{room.type}</strong> · Equip T{room.equipmentLevel}
                    <div><small>Focus: {room.focusService}</small></div>
                  </div>
                  <div className="row">
                    <button
                      disabled={room.equipmentLevel >= 3 || state.cash < 1200 * room.equipmentLevel}
                      onClick={() => setState(upgradeRoomEquipment(state, room.id))}
                    >
                      Upgrade Equip
                    </button>
                    <select value={room.focusService} onChange={(e) => setState(setRoomFocus(state, room.id, e.target.value as ServiceId | 'general'))}>
                      <option value="general">General</option>
                      {SERVICES.filter((service) => service.requiredRoom === room.type).map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </article>
          </section>
        )}

        {state.selectedTab === 'staff' && (
          <section className="grid-2 section-staff">
            <article className="card card-staff-roster">
              <h3>Team</h3>
              <div className="mini-metrics">
                {staffInsights.map((insight) => (
                  <div key={insight.label} className={`mini-metric tone-${insight.tone}`}>
                    <strong>{insight.label}</strong>
                    <span>{insight.value}</span>
                  </div>
                ))}
              </div>
              {state.staff.map((s) => (
                <div key={s.uid} className="row card compact">
                  <div>
                    <strong>{s.name}</strong> · {ROLE_LABELS[s.role]}
                    <div>Morale {s.morale.toFixed(0)} · Fatigue {s.fatigue.toFixed(0)} · Burnout {(s.burnoutRisk * 100).toFixed(0)}% · Wage ${s.wage}/day</div>
                    <small>Trait {s.trait} · Focus {s.specialtyFocus} · Lvl {s.level} ({s.xp} XP) · Training {s.trainingDaysRemaining > 0 ? `${s.trainingDaysRemaining}d` : 'ready'}</small>
                    <small>Speed {Math.round(s.speed * 100)} · Care {Math.round(s.quality * 100)} · Docs {Math.round(s.documentation * 100)}</small>
                  </div>
                  <div className="row">
                    <select value={s.shift} onChange={(e) => setState(setStaffShift(state, s.uid, e.target.value as 'off' | 'half' | 'full'))}>
                      <option value="off">Off</option>
                      <option value="half">Half</option>
                      <option value="full">Full</option>
                    </select>
                    <select value={s.assignedRoom} onChange={(e) => setState(assignStaffRoom(state, s.uid, e.target.value as RoomTypeId | 'flex'))}>
                      <option value="flex">Any room</option>
                      {assignableRoomTypes.map((roomType) => (
                        <option key={roomType} value={roomType}>
                          {roomType}
                        </option>
                      ))}
                    </select>
                    <button disabled={s.role === 'frontDesk' || s.trainingDaysRemaining > 0 || state.cash < 900} onClick={() => setState(startStaffTraining(state, s.uid))}>Train</button>
                    <button onClick={() => setState(toggleStaffSchedule(state, s.uid))}>{s.scheduled ? 'Unschedule' : 'Schedule'}</button>
                    <button className="danger" onClick={() => setState(fireStaff(state, s.uid))}>Fire</button>
                  </div>
                </div>
              ))}
            </article>
            <article className="card card-staff-hire">
              <h3>Recent Staff Thoughts</h3>
              <div className="insight-list">
                {(state.latestSummary?.staffThoughts ?? []).map((thought) => (
                  <button
                    key={thought.id}
                    className={`insight-row tone-${thought.severity === 'high' ? 'negative' : thought.severity === 'medium' ? 'neutral' : 'positive'} ${SEVERITY_BADGE[thought.severity]}`}
                    onClick={() => setDiagnosticFocus(thought.category)}
                    title={`Cause: ${thought.cause}`}
                  >
                    <strong>{thought.text}</strong>
                    <small>{thought.cause}</small>
                  </button>
                ))}
                {!(state.latestSummary?.staffThoughts.length) && <small>Run a day to generate staff reasoning from simulation outcomes.</small>}
              </div>
              <h3>Hire Staff</h3>
              {STAFF_TEMPLATES.map((t) => {
                const canAfford = state.cash >= t.hireCost;
                const specialty = Object.keys(t.specialtyBonus).join(', ') || 'none';
                return (
                  <div key={t.id} className="row card compact">
                    <div>
                      <strong>{t.name}</strong>
                      <div>Hire ${t.hireCost}, wage ${t.baseWage}/day</div>
                      <small>Speed {Math.round(t.speed * 100)} · Quality {Math.round(t.quality * 100)} · Docs {Math.round(t.documentation * 100)} · Specialties: {specialty}</small>
                    </div>
                    <button disabled={!canAfford} onClick={() => {
                      const next = hireStaff(state, t.id);
                      setState(next);
                      if (next !== state) setActionMessage(`Hired ${t.name}.`);
                    }}>{canAfford ? 'Hire' : 'Too Expensive'}</button>
                  </div>
                );
              })}
            </article>
          </section>
        )}

        {state.selectedTab === 'patients' && (
          <section className="card section-patients">
            <h3>Caseload & Demand Quality</h3>
            <div className="row" style={{ marginBottom: 8 }}>
              <label>
                Booking policy:&nbsp;
                <select
                  value={state.bookingPolicy}
                  onChange={(event) => {
                    const policy = event.target.value as BookingPolicy;
                    setState(setBookingPolicy(state, policy));
                    setActionMessage(`Booking policy set to ${POLICY_LABELS[policy]}.`);
                  }}
                >
                  {Object.entries(POLICY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mini-metrics">
              {demandPressure.map((item) => (
                <div key={item.label} className={`mini-metric tone-${item.tone}`}>
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
            <h4>Recent Patient Thoughts</h4>
            <div className="insight-list">
              {(state.latestSummary?.patientThoughts ?? []).map((thought) => (
                <button
                  key={thought.id}
                  className={`insight-row tone-${thought.severity === 'high' ? 'negative' : thought.severity === 'medium' ? 'neutral' : 'positive'} ${SEVERITY_BADGE[thought.severity]}`}
                  onClick={() => setDiagnosticFocus(thought.relatedService ?? thought.category)}
                  title={`Cause: ${thought.cause}`}
                >
                  <strong>{thought.text}</strong>
                  <small>{thought.cause}</small>
                </button>
              ))}
              {!(state.latestSummary?.patientThoughts.length) && <small>Run a day to generate patient reasoning from real causes.</small>}
            </div>
            {diagnosticFocus && (
              <div className="summary-box">
                <h4>Drill-down: {diagnosticFocus}</h4>
                <p>Focus is sourced from simulation diagnostics. Use this to cross-check staffing, room mix, booking policy, and service performance.</p>
                <button className="ghost" onClick={() => setDiagnosticFocus(null)}>Clear focus</button>
              </div>
            )}
            <p>Current booked queue: {state.patientQueue.length}</p>
            <p>Active journeys: {state.patients.filter((patient) => patient.lifecycleState !== 'discharged' && patient.lifecycleState !== 'droppedOut').length} · Total tracked patients: {state.patients.length}</p>
            {state.patientQueue.length === 0 && <p>No patient queue yet. Run a day to generate demand.</p>}
            {state.patientQueue.length > 0 && (
              <div className="summary-box">
                <p>Daily funnel: leads {state.demandSnapshot.inboundLeads} · booked {state.demandSnapshot.bookedVisits} · utilization {state.demandSnapshot.utilization.toFixed(1)}%</p>
                <p>Lost demand: unbooked {state.demandSnapshot.lostDemand.unbooked}, service mismatch {state.demandSnapshot.lostDemand.serviceMismatch}, capacity {state.demandSnapshot.lostDemand.capacity}</p>
                <p>Schedule pressure: peak queue {state.latestSchedule.queueLengthPeak}, missed {state.latestSchedule.missedAppointments}, spillover {state.latestSchedule.spilloverMinutes}m</p>
                <p>Arrival variance: late {state.latestSchedule.lateArrivals}, early {state.latestSchedule.earlyArrivals}, overruns {state.latestSchedule.overruns}, unused gaps {state.latestSchedule.unusedGaps}</p>
                <p>Insured mix: {state.patientQueue.filter((p) => p.insured).length}/{state.patientQueue.length}</p>
                <p>High complexity cases: {state.patientQueue.filter((p) => p.complexity > 0.75).length}</p>
                <p>If no-shows are high, prioritize online booking. If outcomes are low, hire specialist or certification upgrades.</p>
              </div>
            )}
            <div className="summary-box">
              <h4>Day schedule (slots)</h4>
              <p>Used {state.latestSchedule.slotsUsed}/{state.latestSchedule.totalSlots} · Policy {POLICY_LABELS[state.latestSchedule.policy]}</p>
              <div className="layout-grid" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
                {Array.from({ length: 36 }).map((_, index) => {
                  const booked = state.patientQueue.some((visit) => visit.scheduledSlot === index);
                  return <div key={`slot-${index}`} className={`cell ${booked ? 'filled' : ''}`} title={booked ? `Slot ${index + 1}: booked` : `Slot ${index + 1}: open`}>{booked ? '■' : '·'}</div>;
                })}
              </div>
            </div>
            <div className="patient-list">
              {state.patients.slice(0, 8).map((patient) => (
                <div key={`journey-${patient.id}`} className="card compact">
                  <strong>{patient.archetype} · {patient.id.slice(-5)}</strong>
                  <div>Status: {patient.lifecycleState} · Progress {(patient.clinicalProgress * 100).toFixed(0)}%</div>
                  <div>Visits remaining: {patient.remainingVisits}/{patient.expectedTotalVisits} · Next: {patient.nextRecommendedService}</div>
                  <div>Sat {(patient.satisfaction * 100).toFixed(0)} · Adherence {(patient.adherence * 100).toFixed(0)} · Ref {(patient.referralLikelihood * 100).toFixed(0)}%</div>
                  <div>Bookings: {patient.futureBookings.length ? patient.futureBookings.join(', ') : 'none'}</div>
                </div>
              ))}
              {state.patientQueue.slice(0, 20).map((p) => (
                <div key={p.id} className="card compact">
                  <strong>{p.archetype}</strong>
                  <div>Service: {p.service}</div>
                  <div>Complexity: {p.complexity.toFixed(2)} · {p.insured ? 'Insured' : 'Private'}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {state.selectedTab === 'finance' && (
          <section className="grid-2 section-finance">
            <article className="card card-finance-core">
              <h3>Finance Command Center</h3>
              <p>Cash: ${Math.round(state.cash)}</p>
              <p>Weekly fixed costs due: ${Math.round(state.payrollDue)}</p>
              <p>Rent/day: ${state.rent} · Equipment/day: ${state.equipmentCost}</p>
              <p>Docs penalty estimate today: ${financeSnapshot.docsPenaltyEstimate} (variable cost)</p>
              <p>Runway vs fixed liabilities: {financeSnapshot.runwayWeeks.toFixed(1)} week(s)</p>
              <div className="summary-box">
                <p>Margin (latest day): {financeSnapshot.marginPct.toFixed(1)}%</p>
                <p>Breakeven gap: {formatSignedCurrency(financeSnapshot.breakevenGap)} (revenue - variable - daily fixed)</p>
              </div>
              {state.loan && (
                <>
                  <p>Loan principal: ${Math.round(state.loan.principal)} · weekly payment: ${Math.round(state.loan.weeklyPayment)} · weeks left: {state.loan.weeksRemaining}</p>
                  <button disabled={state.cash < 1000} onClick={() => setState(repayLoan(state, Math.min(2000, Math.max(1000, state.cash * 0.1))))}>Repay $1k-$2k</button>
                </>
              )}
              {!state.loan && state.mode === 'campaign' && campaignProgress && (
                <button onClick={() => setState(takeLoan(state, campaignProgress.startingLoanOffer))}>Take scenario financing (${campaignProgress.startingLoanOffer})</button>
              )}
              {state.latestSummary && (
                <>
                  <p>Latest P/L: Revenue ${state.latestSummary.revenue} - Variable ${state.latestSummary.variableCosts} - Fixed ${state.latestSummary.fixedCosts} = ${state.latestSummary.profit}</p>
                  <p>Next weekly charge in {state.latestSummary.daysUntilWeeklyCosts} day(s): ${state.latestSummary.weeklyCostsDueNext}</p>
                </>
              )}
            </article>
            <article className="card card-finance-risk">
              <h3>Risk Flags & Next Action</h3>
              <ul>
                <li>{state.cash < 0 ? '⚠ Negative cashflow' : '✅ Solvent'}</li>
                <li>{state.fatigueIndex > 0.7 ? '⚠ Burnout risk high' : '✅ Burnout manageable'}</li>
                <li>{state.backlogDocs > 10 ? '⚠ Documentation backlog critical' : '✅ Documentation under control'}</li>
                <li>{state.reputation < 20 ? '⚠ Reputation fragile' : '✅ Reputation stable'}</li>
              </ul>
              <p><strong>Suggested move:</strong> {alerts[0] ?? 'No urgent threats. Expand capacity or improve patient mix.'}</p>
              {alerts.length > 1 && (
                <div className="hint-box">
                  <strong>Immediate actions:</strong>
                  <ul>
                    {alerts.slice(1).map((alert) => <li key={alert}>{alert}</li>)}
                  </ul>
                </div>
              )}
            </article>
          </section>
        )}

        {state.selectedTab === 'upgrades' && (
          <section className="card section-upgrades">
            <h3>Upgrade Tree</h3>
            {!availableUpgrades.length && <p>All upgrades purchased.</p>}
            <div className="upgrade-list">
              {availableUpgrades.map((u) => {
                const canAfford = state.cash >= u.cost;
                return (
                  <div key={u.id} className="row card compact">
                    <div>
                      <strong>{u.name}</strong>
                      <div>{u.description}</div>
                      <small>${u.cost} · {summarizeUpgradeEffects(u.effects)}</small>
                    </div>
                    <button disabled={!canAfford} onClick={() => {
                      const next = buyUpgrade(state, u.id);
                      setState(next);
                      if (next !== state) setActionMessage(`Purchased ${u.name}.`);
                    }}>{canAfford ? 'Buy' : 'Too Expensive'}</button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {(state.gameOver || state.gameWon) && (
        <div className="overlay">
          <div className={`panel endgame ${state.gameWon ? "win" : "loss"}`}>
            <h2>{state.gameWon ? 'Campaign Success!' : 'Clinic Crisis'}</h2>
            <p>{state.gameWon ? 'You hit your campaign targets with a sustainable clinic model.' : 'A fail threshold was crossed. Use the reasons + coaching below before your next run.'}</p>
            {!state.gameWon && (
              <ul>
                {inferFailureReasons(state).map((reason) => <li key={reason}>{reason}</li>)}
                {latestWeeklyReport && <li>Last weekly risk signal: {latestWeeklyReport.topRisk}</li>}
                <li>Current cash: ${Math.round(state.cash)} · reputation: {state.reputation.toFixed(0)} · fatigue: {(state.fatigueIndex * 100).toFixed(0)}%</li>
              </ul>
            )}
            {state.gameWon && (
              <ul>
                <li>Reached week {state.week} / {state.campaignGoal.targetWeek}</li>
                <li>Reputation {state.reputation.toFixed(0)} / {state.campaignGoal.targetReputation}</li>
                <li>Cash ${Math.round(state.cash)} / ${state.campaignGoal.targetCash}</li>
                <li>District tier {state.districtTier} · Objectives complete {state.objectiveProgress.filter((item) => item.completed).length}/{state.objectiveProgress.length}</li>
                {latestWeeklyReport && <li>Last weekly report: {latestWeeklyReport.topRisk}</li>}
              </ul>
            )}
            <div className="summary-box">
              <strong>Next-run coaching</strong>
              <ul>
                {coachingPriorities.map((tip) => <li key={`overlay-${tip}`}>{tip}</li>)}
              </ul>
            </div>
            <div className="row">
              <button onClick={() => saveToSlot(1)}>Save Snapshot</button>
              <button onClick={() => startGame(state.mode)}>Retry {state.mode}</button>
              <button className="ghost" onClick={() => setScreen('menu')}>Return to Main Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
