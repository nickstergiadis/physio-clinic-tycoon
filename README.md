# Physiotherapy Clinic Tycoon

A production-ready browser tycoon/management simulation where you build and scale a physiotherapy clinic. You balance patient outcomes, staffing, fatigue, documentation burden, reputation, and finances while expanding services and clinic capacity.

## Stack

- **TypeScript + React** (UI, interaction)
- **Vite** (dev/build tooling)
- **Vitest** (logic tests)
- Fully static output for **GitHub Pages** deployment

## Core Gameplay Loop

1. Start with a small clinic footprint and limited staff.
2. Run day simulation to generate patients and operational outcomes.
3. Earn revenue while paying payroll, rent, maintenance, and admin penalties.
4. Optimize layout, hire/schedule staff, and reduce friction (no-shows, backlog, fatigue).
5. Purchase upgrades to unlock new services/rooms and improve throughput and quality.
6. Scale reputation/referrals while avoiding bankruptcy or operational collapse.

## Implemented Systems

- **Meta progression:** day/week progression, campaign goal, sandbox mode
- **Patients:** 8 archetypes with unique economics and operational characteristics
- **Staff:** 4 staff roles with hiring, scheduling, morale/fatigue behavior
- **Rooms/layout:** tile-based 6x6 build mode, room unlocks and maintenance burden
- **Services:** 9 service lines linked to room requirements
- **Operational friction:** no-shows, documentation backlog, wait-time penalties, fatigue, random events
- **Upgrades:** 10 strategic upgrades with nonlinear tradeoffs/unlocks
- **Risk states:** bankruptcy, reputation collapse, burnout collapse + campaign success state

## UI/UX Surface

- Main menu
- New game / mode select
- Load game
- Tutorial/help
- Settings
- In-game HUD with speed controls and pause
- Build panel
- Staff panel
- Patient/caseload panel
- Finance panel
- Upgrades panel
- End condition overlays (win/fail)

## Save System Notes

- Save data stored in `localStorage`
- Slot metadata and payload versioned (`SAVE_VERSION`)
- Graceful fallback for missing/corrupt storage
- One-click save from in-game HUD (slot `slot-1` for MVP)

## Architecture Overview

```text
src/
  data/content.ts              # typed content definitions (patients, staff, rooms, upgrades, services)
  types/game.ts                # core domain types
  engine/state.ts              # game initialization
  engine/simulation.ts         # simulation loop + operations actions
  engine/persistence.ts        # save/load/settings persistence with migration guard
  ui/App.tsx                   # screen flow + gameplay UI
  ui/styles.css                # visual design system and layout styling
  engine/*.test.ts             # pure logic tests
```

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output is generated into `dist/` and is static-host compatible.

## Deploy to GitHub Pages

This project is configured with `base: './'` in `vite.config.ts` to support static relative-path hosting on GitHub Pages (project pages style).

### Manual deploy

```bash
npm run build
# publish dist/ to gh-pages branch or GitHub Pages artifact
```

### Optional GitHub Actions flow

1. Build on push to `main`.
2. Upload `dist/` artifact.
3. Deploy artifact to GitHub Pages.

(Repository owner can wire this with standard `actions/upload-pages-artifact` + `actions/deploy-pages`.)

## Balance & Content Extension Guide

To extend content:

- Add new patient archetypes in `src/data/content.ts` (`PATIENT_ARCHETYPES`)
- Add room/service pairs and requirements in `ROOM_DEFS` and `SERVICES`
- Add strategic upgrades in `UPGRADES` with typed effects
- Add/adjust operational event cards in `EVENT_CARDS` (`src/engine/simulation.ts`)

Balance levers include:

- revenue per service
- no-show rates
- fatigue gain/recovery
- backlog penalty scaling
- referral/reputation coupling
- maintenance and wage pressure

## Known Scope Choices

- Audio is represented as toggleable settings without embedded sound assets in this MVP.
- Save slots support multiple records, while UI currently emphasizes one-click quick-save behavior.
- Layout uses premium UI cards and grid-based abstraction rather than freeform isometric rendering for MVP velocity and maintainability.
