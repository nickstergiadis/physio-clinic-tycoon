# Prelaunch Checklist (Public Beta)

## Build + automated checks

- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run test:smoke`

## Manual smoke pass (browser)

1. **New game flow**
   - [ ] Open app, start Campaign, run first day.
   - [ ] Confirm summary/banner updates and no UI errors.

2. **Save/resume flow**
   - [ ] Save to a manual slot.
   - [ ] Return to menu and use Continue Latest Progress.
   - [ ] Confirm resumed state matches expectations.

3. **Autosave behavior**
   - [ ] Advance at least one additional day.
   - [ ] Confirm autosave timestamp updates in Load / Manage Saves.
   - [ ] Clear autosave and ensure manual slots remain intact.

4. **Import/export**
   - [ ] Export a save JSON.
   - [ ] Import it back and verify imported entry appears.
   - [ ] Try malformed JSON and verify user-facing error (no crash).

5. **Build actions**
   - [ ] Place and remove at least one room/item.
   - [ ] Confirm no blank-screen or stuck UI state.

6. **Endgame path**
   - [ ] Validate win and/or loss overlay renders and allows return to menu.

7. **Production safety**
   - [ ] Confirm Developer Controls are absent in production build output.

## Deployment sanity

- [ ] GitHub Actions Pages workflow succeeds on target commit.
- [ ] Live Pages build loads and save flows behave correctly in a clean browser profile.
