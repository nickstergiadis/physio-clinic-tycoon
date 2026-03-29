# Physiotherapy Clinic Tycoon (Public Beta)

Physiotherapy Clinic Tycoon is a browser-based management sim where you run a rehab clinic under financial and operational pressure. You scale patient throughput without sacrificing outcomes, morale, or cash runway.

Current status: **public beta / release candidate**.

## Current Gameplay Scope

- **Campaign mode:** scenario-driven goals, failure thresholds, financing pressure, and progression targets.
- **Sandbox mode:** lower pressure for experimentation with layouts, staffing, and upgrades.
- Day-based simulation loop with bottlenecks (capacity, no-shows, documentation, fatigue).
- Build + staffing + upgrade decision layers that directly affect queue flow and profitability.
- Endgame overlays for win/loss paths.

## Save System

The game uses local browser storage with migration + sanitization safeguards.

- **Manual saves:** fixed slots from in-game HUD (Save 1 / Save 2 / Save 3).
- **Autosave:** separate from manual slots, automatically updated after each completed day.
- **Continue Latest Progress:** menu button resumes newest valid source (autosave or manual slot).
- **Load / Manage Saves:** load, delete, export, import, clear autosave, and reset all save data.
- **Import/Export:** portable JSON save files with metadata + versioned game state.

## Controls

- **Main loop:** `Advance Day` or unpause with speed controls (1x / 2x / 3x).
- **Keyboard:**
  - `Space` = pause/resume
  - `1-6` = tab switching
- **Build tab:** choose a room/item/path tool, then click layout tiles to place/remove.

## Development

```bash
npm install
npm run dev
```

## Testing

```bash
npm test
npm run test:smoke
```

- `npm test` runs logic/unit coverage (engine + UI tests).
- `npm run test:smoke` runs release-focused UI smoke/regression flows.

## Build

```bash
npm run build
```

Build artifacts are generated in `dist/`.

## GitHub Pages Deploy

Deployment is handled by `.github/workflows/deploy-pages.yml`.

- Triggers on push to `main` (and manual dispatch).
- Runs `npm ci` + `npm run build`.
- Uploads `dist/` and deploys via `actions/deploy-pages`.

`vite.config.ts` uses a relative base path (`./`) for project-pages compatibility.

## Scope Notes

This branch is focused on release hardening for public beta. It intentionally does **not** include Phase 2 systems like prestige/meta progression, marketing gameplay, staff career trees, or competitor simulation.
