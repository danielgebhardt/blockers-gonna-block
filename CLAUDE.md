# Blockers Gonna Block — notes for Claude

An original Android sliding-block puzzle game.

- Repo: https://github.com/danielgebhardt/blockers-gonna-block
- Work branch: `claude/amazing-cannon-rjyfd9` (kept equal to `main` when shipped).
- Latest APK (rebuilt by CI on every push to main): https://github.com/danielgebhardt/blockers-gonna-block/releases/download/latest/blockers-gonna-block.apk
- Latest unsigned iOS build (same release, sideloaded with a free Apple ID; see README): https://github.com/danielgebhardt/blockers-gonna-block/releases/download/latest/blockers-gonna-block.ipa

Read `README.md` for the rules, layout and level pipeline.

## Stack / workflow (keep exactly)
- TypeScript, Phaser 4 and Vite, wrapped with Capacitor 8 for Android and iOS (`@capacitor/preferences`, `haptics`, `status-bar`). Vitest for tests; scripts run with `tsx`.
- iOS (`ios/`, Swift Package Manager) is for sideloading only, no App Store. `npm run ios` = web build + `scripts/icon.ts` + `cap sync ios`. The iOS icon/splash PNGs are rasterised by `scripts/icon.ts` from the same shapes as the Android vectors and are gitignored.
- No image or audio files committed. Everything is drawn with Phaser Graphics (`src/game/draw.ts`), and sounds are synthesised with WebAudio (`src/game/audio.ts`).
- Renders at devicePixelRatio, portrait only, and respects safe-area insets.
- App id `com.danielgebhardt.blockersgonnablock`. The debug keystore is committed (`android/keystore`). `versionCode` comes from `GITHUB_RUN_NUMBER`.
- CI (`.github/workflows/android.yml`): every push runs the tests and the web build, then an unsigned `.ipa` build on `macos-26`. Pushes to main also build the APK, republish the `latest` pre-release, and attach the `.ipa` to it.
- Commit work to the branch. Fast-forward main (`git push origin claude/amazing-cannon-rjyfd9:main`) only when all tests pass; the user has authorised pushing main this way.
- Don't open PRs unless asked.

## Game rules (pure TS in `src/core`, no Phaser)
- **Dragging:** a dragged block follows the finger through free cells and around corners.
- **Moves:** consecutive drags of the same block are ONE move. A move ends when you drag a different block, or when a block leaves or peels. Dragging a block straight back home cancels the move.
- **Leaving:** a block leaves through a gate of its colour if its width along that edge fits the gate.
- **Sets:**

| Levels | Set | Obstacle |
|---|---|---|
| 1–10 | Basics | none |
| 11–40 | Stonework | walls and holes |
| 41–70 | One Way | blocks that slide on one axis |
| 71–100 | Deep Freeze | ice that thaws as blocks leave |
| 101–130 | Layers | the shell peels; the core stays |
| 131–160 | Shifting Gates | gate colour cycles on each exit |
| 161–190 | Lock & Key | padlock opens once a block of that FINAL colour has left |
| 191–220 | Pressure Plates | barred gate opens only while ANOTHER block stands on its plate |

- **Stars:** 3 at or under par, 2 within par + 20% (minimum +2), otherwise 1. Using undo costs 1 star and using a hint costs 1 star, with a minimum of 1.
- **Unlocking:** a set opens after 5 clears in the previous set. Within a set, levels open 2 ahead of the furthest one cleared.
- **IDs and saves:** levels have permanent ids (e.g. `stone-07`), and saves are keyed by id (save v2; v1 saves migrate). Display numbers are fixed by `src/core/sets.ts`.

## Key code
- `src/core/engine.ts`: compile, moves, exits.
  - `gateOpen()` checks padlocks and plates.
  - `nonMonotone` (shifting gates or plates) disables the solver's forced-exit pruning and enables the in-game dead-end check.
  - `relaxedClear()` is the heuristic.
- `src/core/solver.ts`: exact A* (Zobrist hashing, lazy refinement, pathmax, "same block twice" pruning). It's cross-checked against brute force in `tests/solver.test.ts`.
- `src/core/audit.ts`: every obstacle must change par when neutralised. A shell must cost more than its own peel.
- `src/core/session.ts`: move merging, undo and stars.
- `src/core/levelhash.ts`: new gate and plate fields are hashed only when present, so old hashes stay valid.
- `src/game/scenes`:
  - `MenuScene`
  - `LevelSelectScene`: set overview plus a per-set grid.
  - `PlayScene`: drag input, hints via a solver worker, the stuck warning, and plate rings drawn above blocks.
- `scripts/generate.ts` takes `--only '<id regex>' --climbs N --resume --select-only`. Helpers live in `scripts/lib/{slots,construct,mutate,climb,evaluate,finish,worker}.ts`.
  - `finish.ts` strips decorative obstacles and re-evaluates the level.
  - `slots.ts` has `SPEC_OVERRIDES` for `shift-20` and `plates-25`.
- `scripts/freeze.ts '<regex>'` pins level hashes in `src/levels/levels.lock.json`.
- `scripts/repair.ts` strips decorative obstacles from existing candidates.
- `e2e/play.ts <numbers> [--shots a,b]`: Playwright at Pixel 7 size with real CDP touch drags. It asserts that each level clears in exactly par.
- `e2e/flows.ts`: tests merged moves, undo, hint and the stuck warning.
- For Playwright, use `executablePath /opt/pw-browsers/chromium` if it exists.

## Level pipeline (per set)
1. Generate with 4 climbs per slot on 4 worker threads. Launch long jobs detached with `nohup`.
2. Re-run weak slots with `--climbs 10 --resume`.
3. Run `--select-only`, then diff the levels against HEAD. Re-run the touch playthrough for any level whose pick changed.
4. Run `npm test`, then `e2e/play.ts` on every new level, then freeze, then commit and push main.

The cloud container restarts every 1–2 hours. Candidates persist in `scripts/out/` (gitignored), so resume with `--resume`. Check progress every 15 minutes rather than waiting hours.

## State
- All 220 levels are generated, frozen and shipped, and 905 tests pass.
- Level 150 (`shift-20`) ships as a documented near miss of its targets.
- The generator doesn't target dead-end "traps", so the Shifting Gates and Pressure Plates sets test move order more than traps. Adding a trap target is a possible next improvement.
- All automated testing has been in Chromium at Pixel 7 size. The iOS build is only compile-checked in CI; it's tested on the user's devices. The user plays on a real phone and gives feedback.

## Rules for future work
- **Never change a frozen level.** Names and tips may change, since they aren't hashed.
- **Append new sets after Pressure Plates** in `src/core/sets.ts`, so existing numbering and saves are untouched.
