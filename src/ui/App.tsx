import { useEffect, useMemo, useState } from 'react';
import { ROOM_DEFS, STAFF_TEMPLATES, UPGRADES } from '../data/content';
import { buyUpgrade, fireStaff, hireStaff, placeRoom, removeRoom, runDay, toggleStaffSchedule } from '../engine/simulation';
import { deleteSlot, loadSettings, loadSlots, saveSettings, saveSlot } from '../engine/persistence';
import { createInitialState } from '../engine/state';
import { GameMode, GameState, RoomTypeId, SaveSlot, Screen } from '../types/game';

const tabs: GameState['selectedTab'][] = ['overview', 'build', 'staff', 'patients', 'finance', 'upgrades'];

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
    const id = window.setTimeout(() => setActionMessage(''), 2500);
    return () => clearTimeout(id);
  }, [actionMessage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!state || screen !== 'inGame') return;
      if (event.key === ' ') {
        event.preventDefault();
        setState((prev) => (prev ? { ...prev, paused: !prev.paused, speed: prev.paused ? Math.max(prev.speed, 1) as GameState['speed'] : 0 } : prev));
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
    if (!state || screen !== 'inGame' || state.paused || state.speed === 0) return;
    const ms = state.speed === 1 ? 2000 : state.speed === 2 ? 1200 : 700;
    const id = window.setInterval(() => setState((prev) => (prev ? runDay(prev) : prev)), ms);
    return () => clearInterval(id);
  }, [screen, state?.paused, state?.speed]);

  const startGame = (mode: GameMode) => {
    const initial = createInitialState(mode);
    initial.settings = loadSettings();
    setState(initial);
    setSelectedBuildRoom('treatment');
    setActionMessage('Welcome! Start by running one day, then expand a room or hire staff.');
    setScreen('inGame');
  };

  if (screen === 'menu') {
    return (
      <div className="shell menu">
        <h1>PHYSIOTHERAPY CLINIC TYCOON</h1>
        <p className="subtitle">Build a thriving rehab business. Balance outcomes, capacity, morale, and cashflow.</p>
        <div className="menu-actions">
          <button onClick={() => setScreen('newGame')}>New Game</button>
          <button onClick={() => setScreen('loadGame')}>Load Game</button>
          <button onClick={() => setScreen('tutorial')}>Tutorial</button>
          <button onClick={() => setScreen('settings')}>Settings</button>
        </div>
      </div>
    );
  }

  if (screen === 'newGame') {
    return (
      <div className="shell panel">
        <h2>Choose Play Mode</h2>
        <div className="grid-2">
          <button onClick={() => startGame('campaign')}>
            <strong>Campaign</strong>
            <span>Reach cash and reputation goals by week 12.</span>
          </button>
          <button onClick={() => startGame('sandbox')}>
            <strong>Sandbox</strong>
            <span>Start with more capital and build freely.</span>
          </button>
        </div>
        <button className="ghost" onClick={() => setScreen('menu')}>Back</button>
      </div>
    );
  }

  if (screen === 'loadGame') {
    return (
      <div className="shell panel">
        <h2>Load Game</h2>
        {!slots.length && <p>No save slots found.</p>}
        {slots.map((slot) => (
          <div key={slot.id} className="row card">
            <div>
              <strong>{slot.label}</strong>
              <div>Week {slot.state.week} · Cash ${Math.round(slot.state.cash)} · Rep {slot.state.reputation.toFixed(0)}</div>
            </div>
            <div className="row">
              <button onClick={() => { setState(slot.state); setSelectedBuildRoom('treatment'); setScreen('inGame'); }}>Load</button>
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
        <h2>Quick Onboarding</h2>
        <ol>
          <li>Run one day first to see your baseline revenue and risk profile.</li>
          <li>In <strong>Overview</strong>, fix red risk flags before you scale.</li>
          <li>In <strong>Build</strong>, select a room, then click any + tile to place it.</li>
          <li>In <strong>Staff</strong>, keep at least one clinician scheduled to treat patients.</li>
          <li>Invest in <strong>Upgrades</strong> when docs backlog or no-shows become costly.</li>
          <li>Use three rotating quick-save slots from the HUD every few days.</li>
        </ol>
        <button onClick={() => setScreen('menu')}>Back</button>
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

  const saveCurrent = () => {
    const slotNum = (state.week % 3) + 1;
    const slotId = `slot-${slotNum}`;
    const label = `${state.mode.toUpperCase()} W${state.week} D${state.day}`;
    const updated = saveSlot(slotId, label, state);
    setSlots(updated);
    setActionMessage(`Saved to slot ${slotNum}.`);
  };

  const availableUpgrades = UPGRADES.filter((u) => !state.unlockedUpgrades.includes(u.id));

  const campaignProgress = useMemo(() => {
    if (state.mode !== 'campaign') return null;
    return {
      week: `${state.week}/${state.campaignGoal.targetWeek}`,
      rep: `${state.reputation.toFixed(0)}/${state.campaignGoal.targetReputation}`,
      cash: `${Math.round(state.cash)}/${state.campaignGoal.targetCash}`
    };
  }, [state]);

  const onboardingChecklist = [
    { done: Boolean(state.latestSummary), label: 'Run your first day' },
    { done: state.rooms.length >= 5 || state.staff.length >= 4, label: 'Add one room or hire one staff member' },
    { done: state.unlockedUpgrades.length > 0, label: 'Buy your first upgrade' },
    { done: state.latestSummary ? state.latestSummary.profit > 0 : false, label: 'Finish a profitable day' }
  ];

  const clinicianScheduled = state.staff.some((s) => s.scheduled && (s.role === 'physio' || s.role === 'assistant' || s.role === 'specialist'));

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
        {!!actionMessage && <div className="status-banner">{actionMessage}</div>}
        <div className="row">
          <button onClick={() => setState({ ...state, paused: !state.paused, speed: state.paused ? Math.max(state.speed, 1) as GameState['speed'] : 0 })}>{state.paused ? '▶ Resume' : '⏸ Pause'}</button>
          <button onClick={() => setState({ ...state, speed: 1, paused: false })}>1x</button>
          <button onClick={() => setState({ ...state, speed: 2, paused: false })}>2x</button>
          <button onClick={() => setState({ ...state, speed: 3, paused: false })}>3x</button>
          <button onClick={() => setState(runDay(state))}>Advance Day</button>
          <button onClick={saveCurrent}>Save</button>
          <button className="ghost" onClick={() => setScreen('menu')}>Main Menu</button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map((tab) => (
          <button key={tab} className={state.selectedTab === tab ? 'active' : ''} onClick={() => setState({ ...state, selectedTab: tab })}>{tab}</button>
        ))}
      </nav>

      <main className="content">
        {state.selectedTab === 'overview' && (
          <section className="grid-2">
            <article className="card">
              <h3>Operations Snapshot</h3>
              <p>Rooms: {state.rooms.length}/{state.maxClinicSize}</p>
              <p>Staff scheduled: {state.staff.filter((s) => s.scheduled).length}/{state.staff.length}</p>
              <p>Patients generated today: {state.patientQueue.length}</p>
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
                <div>
                  <h4>Last Day Summary</h4>
                  <p>Revenue ${state.latestSummary.revenue} · Expenses ${state.latestSummary.expenses} · Profit ${state.latestSummary.profit}</p>
                  <p>Treated {state.latestSummary.treated} · No-shows {state.latestSummary.noShows} · Outcome {state.latestSummary.avgOutcome}</p>
                </div>
              )}
            </article>
            <article className="card">
              <h3>Event Log</h3>
              <ul>
                {state.eventLog.map((line, idx) => <li key={`${line}-${idx}`}>{line}</li>)}
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
              <p>Select a room type at right, then click a + tile to place. Click a room tile to remove it.</p>
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
                          return;
                        }
                        if (!selectedBuildRoom) {
                          setActionMessage('Select a room type first.');
                          return;
                        }
                        const next = placeRoom(state, selectedBuildRoom, x, y);
                        setState(next);
                        setActionMessage(next === state ? 'Cannot place room here (locked, full, or insufficient cash).' : `Placed ${selectedBuildRoom}.`);
                      }}
                    >
                      {room ? room.type.slice(0, 4) : '+'}
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
                      <small>${room.cost} · maint ${room.maintenance}/day</small>
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
                    <strong>{s.name}</strong> · {s.role}
                    <div>Morale {s.morale.toFixed(0)} · Fatigue {s.fatigue.toFixed(0)} · Wage ${s.wage}/day</div>
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
                return (
                  <div key={t.id} className="row card compact">
                    <div>
                      <strong>{t.name}</strong>
                      <div>Hire ${t.hireCost}, wage ${t.baseWage}/day</div>
                    </div>
                    <button disabled={!canAfford} onClick={() => setState(hireStaff(state, t.id))}>{canAfford ? 'Hire' : 'Too Expensive'}</button>
                  </div>
                );
              })}
            </article>
          </section>
        )}

        {state.selectedTab === 'patients' && (
          <section className="card">
            <h3>Caseload Archetypes</h3>
            <p>Generated queue today: {state.patientQueue.length}</p>
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
              <p>Rent/day: ${state.rent}</p>
              <p>Equipment/day: ${state.equipmentCost}</p>
              <p>Payroll/day: ${state.payrollDue}</p>
              <p>Estimated runway: {state.cash > 0 ? Math.round(state.cash / Math.max(1, state.payrollDue + state.rent)) : 0} days</p>
            </article>
            <article className="card">
              <h3>Risk Flags</h3>
              <ul>
                <li>{state.cash < 0 ? '⚠ Negative cashflow' : '✅ Solvent'}</li>
                <li>{state.fatigueIndex > 0.7 ? '⚠ Burnout risk high' : '✅ Burnout manageable'}</li>
                <li>{state.backlogDocs > 10 ? '⚠ Documentation backlog critical' : '✅ Documentation under control'}</li>
                <li>{state.reputation < 20 ? '⚠ Reputation fragile' : '✅ Reputation stable'}</li>
              </ul>
            </article>
          </section>
        )}

        {state.selectedTab === 'upgrades' && (
          <section className="card">
            <h3>Upgrade Tree</h3>
            <div className="upgrade-list">
              {availableUpgrades.map((u) => {
                const canAfford = state.cash >= u.cost;
                return (
                  <div key={u.id} className="row card compact">
                    <div>
                      <strong>{u.name}</strong>
                      <div>{u.description}</div>
                      <small>${u.cost}</small>
                    </div>
                    <button disabled={!canAfford} onClick={() => setState(buyUpgrade(state, u.id))}>{canAfford ? 'Buy' : 'Too Expensive'}</button>
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
            <p>{state.gameWon ? 'You built a high-performing rehab clinic by week target.' : 'Your clinic hit a failure threshold. Adjust staffing, cashflow, and upgrades next run.'}</p>
            <div className="row">
              <button onClick={saveCurrent}>Save Snapshot</button>
              <button onClick={() => startGame(state.mode)}>Retry {state.mode}</button>
              <button className="ghost" onClick={() => setScreen('menu')}>Return to Main Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
