import { useEffect, useState } from 'react';
import { ROOM_DEFS, STAFF_TEMPLATES, UPGRADES } from '../data/content';
import { buyUpgrade, fireStaff, hireStaff, placeRoom, removeRoom, runDay, toggleStaffSchedule } from '../engine/simulation';
import { deleteSlot, loadSettings, loadSlots, saveSettings, saveSlot } from '../engine/persistence';
import { createInitialState } from '../engine/state';
import { DaySummary, GameMode, GameState, RoomTypeId, SaveSlot, Screen, StaffRoleId } from '../types/game';

const tabs: GameState['selectedTab'][] = ['overview', 'build', 'staff', 'patients', 'finance', 'upgrades'];

const ROLE_LABELS: Record<StaffRoleId, string> = {
  physio: 'Physio',
  assistant: 'Assistant',
  frontDesk: 'Front Desk',
  specialist: 'Specialist'
};

const ROOM_ABBR: Record<RoomTypeId, string> = {
  reception: 'REC',
  waiting: 'WAIT',
  treatment: 'TRT',
  gym: 'GYM',
  vestibularLab: 'VEST',
  hydro: 'HYD'
};

const formatDateTime = (timestamp: number) => new Date(timestamp).toLocaleString();

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

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [state, setState] = useState<GameState | null>(null);
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [selectedBuildRoom, setSelectedBuildRoom] = useState<RoomTypeId | null>(null);
  const [actionMessage, setActionMessage] = useState<string>('');

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
    const initial = createInitialState(mode);
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
        <h1>PHYSIOTHERAPY CLINIC TYCOON</h1>
        <p className="subtitle">Build a thriving rehab business. Balance outcomes, capacity, morale, and cashflow.</p>
        <div className="menu-actions">
          <button onClick={() => setScreen('newGame')}>New Game</button>
          <button disabled={!newest} onClick={continueLatest} title={!newest ? 'No save found yet' : `Load ${newest.label}`}>Continue Latest Save</button>
          <button onClick={() => setScreen('loadGame')}>Load / Manage Saves</button>
          <button onClick={() => setScreen('tutorial')}>How to Play (2 min)</button>
          <button onClick={() => setScreen('settings')}>Settings</button>
        </div>
        {newest && <p className="subtitle">Latest save: {newest.label} · {formatDateTime(newest.timestamp)}</p>}
      </div>
    );
  }

  if (screen === 'newGame') {
    return (
      <div className="shell panel">
        <h2>Choose Play Mode</h2>
        <div className="grid-2">
          <button onClick={() => startGame('campaign')}>
            <strong>Campaign (Goal-driven)</strong>
            <span>Reach ${60000} cash and 78 reputation by week 12. Tight pacing, strategic trade-offs.</span>
          </button>
          <button onClick={() => startGame('sandbox')}>
            <strong>Sandbox (Creative)</strong>
            <span>Start with $45,000 and no win/fail pressure. Good for experimenting with layouts/upgrades.</span>
          </button>
        </div>
        <button className="ghost" onClick={() => setScreen('menu')}>Back</button>
      </div>
    );
  }

  if (screen === 'loadGame') {
    return (
      <div className="shell panel">
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
      <div className="shell panel">
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
      <div className="shell panel">
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
    return {
      week: `${state.week}/${state.campaignGoal.targetWeek}`,
      rep: `${state.reputation.toFixed(0)}/${state.campaignGoal.targetReputation}`,
      cash: `${Math.round(state.cash)}/${state.campaignGoal.targetCash}`
    };
  })();

  const onboardingChecklist = [
    { done: Boolean(state.latestSummary), label: 'Run your first day' },
    { done: state.rooms.length >= 5 || state.staff.length >= 4, label: 'Add one room or hire one staff member' },
    { done: state.unlockedUpgrades.length > 0, label: 'Buy your first upgrade' },
    { done: state.latestSummary ? state.latestSummary.profit > 0 : false, label: 'Finish a profitable day' }
  ];

  const clinicianScheduled = state.staff.some((s) => s.scheduled && (s.role === 'physio' || s.role === 'assistant' || s.role === 'specialist'));
  const emptyTiles = state.maxClinicSize - state.rooms.length;
  const docsPenaltyEstimate = state.backlogDocs > 11 ? Math.round((state.backlogDocs - 11) * 14) : 0;
  const lowRunway = state.cash > 0 ? Math.round(state.cash / Math.max(1, state.payrollDue)) : 0;

  const alerts: string[] = [];
  if (!clinicianScheduled) alerts.push('No clinician is scheduled. You will treat 0 patients.');
  if (state.backlogDocs > 10) alerts.push('Documentation backlog is costing penalties. Prioritize admin capacity or EHR upgrade.');
  if (state.fatigueIndex > 0.7) alerts.push('Fatigue risk is high. Consider unscheduling or wellness upgrades.');
  if (state.cash < 0) alerts.push('You are in negative cash. Cut costs or raise throughput immediately.');

  return (
    <div className="shell game">
      <header className="hud">
        <div className="hud-main">
          <h2>Physiotherapy Clinic Tycoon</h2>
          <div>Day {state.day} · Week {state.week} · Mode: {state.mode}</div>
        </div>
        <div className="hud-stats">
          <div title="Cash available for payroll, rent and expansion">Cash: <strong>${Math.round(state.cash)}</strong></div>
          <div title="Impacts referrals and premium pricing">Rep: <strong>{state.reputation.toFixed(0)}</strong></div>
          <div title="Projected incoming patient volume">Referrals: <strong>{state.referrals}</strong></div>
          <div title="Clinic-wide fatigue risk">Fatigue: <strong>{(state.fatigueIndex * 100).toFixed(0)}%</strong></div>
          <div title="Unfinished documentation creates penalties">Docs: <strong>{state.backlogDocs.toFixed(1)}</strong></div>
        </div>
        {alerts.length > 0 && <div className="alert-strip">Priority: {alerts[0]}</div>}
        {!!actionMessage && <div className="status-banner">{actionMessage}</div>}
        <div className="row">
          <button onClick={() => setState({ ...state, paused: !state.paused, speed: state.paused ? (Math.max(state.speed, 1) as GameState['speed']) : 0 })}>{state.paused ? '▶ Resume' : '⏸ Pause'}</button>
          <button className={state.speed === 1 && !state.paused ? 'speed-active' : ''} onClick={() => setState({ ...state, speed: 1, paused: false })}>1x</button>
          <button className={state.speed === 2 && !state.paused ? 'speed-active' : ''} onClick={() => setState({ ...state, speed: 2, paused: false })}>2x</button>
          <button className={state.speed === 3 && !state.paused ? 'speed-active' : ''} onClick={() => setState({ ...state, speed: 3, paused: false })}>3x</button>
          <button onClick={() => {
            const next = runDay(state);
            setState(next);
            if (next.latestSummary) setActionMessage(getDayMessage(next.latestSummary));
          }}>Advance Day</button>
          <button onClick={() => saveToSlot(1)}>Save 1</button>
          <button onClick={() => saveToSlot(2)}>Save 2</button>
          <button onClick={() => saveToSlot(3)}>Save 3</button>
          <button className="ghost" onClick={() => setScreen('menu')}>Main Menu</button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map((tab, index) => (
          <button key={tab} className={state.selectedTab === tab ? 'active' : ''} onClick={() => setState({ ...state, selectedTab: tab })}>
            {index + 1}. {tab}
          </button>
        ))}
      </nav>

      <main className="content">
        {state.selectedTab === 'overview' && (
          <section className="grid-2">
            <article className="card">
              <h3>Operations Snapshot</h3>
              <p>Rooms: {state.rooms.length}/{state.maxClinicSize}</p>
              <p>Staff scheduled: {state.staff.filter((s) => s.scheduled).length}/{state.staff.length}</p>
              <p>Booked visits in pipeline: {state.patientQueue.length}</p>
              <p>Utilization (latest day): {state.demandSnapshot.utilization.toFixed(1)}%</p>
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
                  <p>Revenue ${state.latestSummary.revenue} · Expenses ${state.latestSummary.expenses} · Profit ${state.latestSummary.profit}</p>
                  <p>Leads {state.latestSummary.inboundLeads} → Booked {state.latestSummary.bookedVisits} → Attended {state.latestSummary.attendedVisits} ({state.latestSummary.utilization.toFixed(1)}% utilization)</p>
                  <p>Lost: unbooked {state.latestSummary.lostDemand.unbooked}, capacity {state.latestSummary.lostDemand.capacity}, cancellations {state.latestSummary.lostDemand.cancellations}, no-shows {state.latestSummary.lostDemand.noShows}</p>
                  {state.latestSummary.notes.length > 0 && (
                    <ul>
                      {state.latestSummary.notes.map((note) => <li key={note}>{note}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </article>
            <article className="card">
              <h3>Event Log</h3>
              <ul>
                {state.eventLog.length === 0 && <li>No events recorded yet.</li>}
                {state.eventLog.map((line, idx) => <li key={`${idx}-${line}`}>{line}</li>)}
              </ul>
              {campaignProgress && (
                <div className="campaign-box">
                  <h4>Campaign Goal</h4>
                  <p>Week {campaignProgress.week}</p>
                  <p>Reputation {campaignProgress.rep}</p>
                  <p>Cash {campaignProgress.cash}</p>
                </div>
              )}
            </article>
          </section>
        )}

        {state.selectedTab === 'build' && (
          <section className="grid-2">
            <article className="card">
              <h3>Layout (6x6)</h3>
              <p>Capacity left: <strong>{emptyTiles}</strong> room slots. Select a room on the right, then click a + tile to place.</p>
              <div className="layout-grid">
                {Array.from({ length: 36 }).map((_, i) => {
                  const x = i % 6;
                  const y = Math.floor(i / 6);
                  const room = state.rooms.find((r) => r.x === x && r.y === y);
                  return (
                    <button
                      key={`${x}-${y}`}
                      className={`cell ${room ? 'filled' : ''}`}
                      title={room ? `${room.type} (click to remove)` : selectedBuildRoom ? `Place ${selectedBuildRoom}` : 'Select a room type first'}
                      onClick={() => {
                        if (room) {
                          const next = removeRoom(state, room.id);
                          setState(next);
                          if (next !== state) setActionMessage(`Removed ${room.type}.`);
                          else setActionMessage('Cannot remove the last required core room of that type.');
                          return;
                        }
                        if (!selectedBuildRoom) {
                          setActionMessage('Select a room type first.');
                          return;
                        }
                        const next = placeRoom(state, selectedBuildRoom, x, y);
                        setState(next);
                        setActionMessage(next === state ? 'Cannot place room here (locked, full, occupied, or insufficient cash).' : `Placed ${selectedBuildRoom}.`);
                      }}
                    >
                      {room ? ROOM_ABBR[room.type] : '+'}
                    </button>
                  );
                })}
              </div>
            </article>
            <article className="card">
              <h3>Build Rooms</h3>
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
                      <small>${room.cost} · maintenance ${room.maintenance}/day · throughput +{Math.round(room.throughputBonus * 100)}%</small>
                    </span>
                    <span>{!unlocked ? 'Locked' : !affordable ? 'Too Expensive' : 'Select'}</span>
                  </button>
                );
              })}
            </article>
          </section>
        )}

        {state.selectedTab === 'staff' && (
          <section className="grid-2">
            <article className="card">
              <h3>Team</h3>
              {state.staff.map((s) => (
                <div key={s.uid} className="row card compact">
                  <div>
                    <strong>{s.name}</strong> · {ROLE_LABELS[s.role]}
                    <div>Morale {s.morale.toFixed(0)} · Fatigue {s.fatigue.toFixed(0)} · Wage ${s.wage}/day</div>
                    <small>Speed {Math.round(s.speed * 100)} · Care {Math.round(s.quality * 100)} · Docs {Math.round(s.documentation * 100)}</small>
                  </div>
                  <div className="row">
                    <button onClick={() => setState(toggleStaffSchedule(state, s.uid))}>{s.scheduled ? 'Unschedule' : 'Schedule'}</button>
                    <button className="danger" onClick={() => setState(fireStaff(state, s.uid))}>Fire</button>
                  </div>
                </div>
              ))}
            </article>
            <article className="card">
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
          <section className="card">
            <h3>Caseload & Demand Quality</h3>
            <p>Current booked queue: {state.patientQueue.length}</p>
            {state.patientQueue.length === 0 && <p>No patient queue yet. Run a day to generate demand.</p>}
            {state.patientQueue.length > 0 && (
              <div className="summary-box">
                <p>Daily funnel: leads {state.demandSnapshot.inboundLeads} · booked {state.demandSnapshot.bookedVisits} · utilization {state.demandSnapshot.utilization.toFixed(1)}%</p>
                <p>Lost demand: unbooked {state.demandSnapshot.lostDemand.unbooked}, service mismatch {state.demandSnapshot.lostDemand.serviceMismatch}, capacity {state.demandSnapshot.lostDemand.capacity}</p>
                <p>Insured mix: {state.patientQueue.filter((p) => p.insured).length}/{state.patientQueue.length}</p>
                <p>High complexity cases: {state.patientQueue.filter((p) => p.complexity > 0.75).length}</p>
                <p>If no-shows are high, prioritize online booking. If outcomes are low, hire specialist or certification upgrades.</p>
              </div>
            )}
            <div className="patient-list">
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
          <section className="grid-2">
            <article className="card">
              <h3>Finance</h3>
              <p>Cash: ${Math.round(state.cash)}</p>
              <p>Weekly fixed costs due: ${Math.round(state.payrollDue)}</p>
              <p>Rent/day: ${state.rent} · Equipment/day: ${state.equipmentCost}</p>
              <p>Docs penalty estimate today: ${docsPenaltyEstimate} (variable cost)</p>
              <p>Runway vs fixed liabilities: {lowRunway} week(s)</p>
              {state.latestSummary && (
                <>
                  <p>Latest P/L: Revenue ${state.latestSummary.revenue} - Variable ${state.latestSummary.variableCosts} - Fixed ${state.latestSummary.fixedCosts} = ${state.latestSummary.profit}</p>
                  <p>Next weekly charge in {state.latestSummary.daysUntilWeeklyCosts} day(s): ${state.latestSummary.weeklyCostsDueNext}</p>
                </>
              )}
            </article>
            <article className="card">
              <h3>Risk Flags</h3>
              <ul>
                <li>{state.cash < 0 ? '⚠ Negative cashflow' : '✅ Solvent'}</li>
                <li>{state.fatigueIndex > 0.7 ? '⚠ Burnout risk high' : '✅ Burnout manageable'}</li>
                <li>{state.backlogDocs > 10 ? '⚠ Documentation backlog critical' : '✅ Documentation under control'}</li>
                <li>{state.reputation < 20 ? '⚠ Reputation fragile' : '✅ Reputation stable'}</li>
              </ul>
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
          <section className="card">
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
          <div className="panel">
            <h2>{state.gameWon ? 'Campaign Success!' : 'Clinic Crisis'}</h2>
            <p>{state.gameWon ? 'You achieved the campaign goals. Great balance of outcomes, growth, and sustainability.' : 'Your clinic crossed a failure threshold. Review causes below and retry with a tighter plan.'}</p>
            {!state.gameWon && (
              <ul>
                {inferFailureReasons(state).map((reason) => <li key={reason}>{reason}</li>)}
                <li>Current cash: ${Math.round(state.cash)} · reputation: {state.reputation.toFixed(0)} · fatigue: {(state.fatigueIndex * 100).toFixed(0)}%</li>
              </ul>
            )}
            {state.gameWon && (
              <ul>
                <li>Reached week {state.week} / {state.campaignGoal.targetWeek}</li>
                <li>Reputation {state.reputation.toFixed(0)} / {state.campaignGoal.targetReputation}</li>
                <li>Cash ${Math.round(state.cash)} / ${state.campaignGoal.targetCash}</li>
              </ul>
            )}
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
