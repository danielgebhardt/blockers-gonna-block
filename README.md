# Blockers Gonna Block

An original sliding-block puzzle for Android. Drag coloured blocks around a box and push each one out through a gate of its own colour. The gate has to be wide enough. The puzzle is the order: the blocks are in each other's way.

**Latest APK:** https://github.com/danielgebhardt/blockers-gonna-block/releases/download/latest/blockers-gonna-block.apk
(every push to `main` rebuilds it; it installs over the previous build and keeps your progress)

## Rules

- A dragged block follows your finger cell by cell, in any direction and around corners, until other blocks or walls stop it. Dragging the same block again counts as the same move; a move ends when you drag a different block, or when a block leaves or peels. Dragging a block straight back to where it started cancels the move.
- A block leaves when you push it against a gate of the same colour whose opening covers the block's whole width along that edge.
- Clear every block. There is no timer. Par is the shortest possible solution, proven by an exact solver.
- Stars: 3 for at most par moves, 2 for par + 20% (at least +2), otherwise 1. Using undo costs a star, and so does using a hint (each counts once per attempt). You always get at least 1 star.

160 levels in six sets. Each set opens once you've cleared 5 levels of the set before it; inside a set, levels open two ahead of the furthest one you've cleared. Later waves of each set mix in the obstacles from earlier sets.

| Levels | Set | New obstacle |
|---|---|---|
| 1–10    | Basics | colours and gates |
| 11–40   | Stonework | stone walls inside the box, holes and notches in the board |
| 41–70   | One Way | blocks that slide only left/right or only up/down |
| 71–100  | Deep Freeze | frozen blocks: can't move until *n* other blocks have left |
| 101–130 | Layers | leaving through the shell colour peels the shell; the core stays and needs its own gate |
| 131–160 | Shifting Gates | gates change colour every time a block leaves |

Levels have permanent ids (`stone-07`), so progress is saved per level and survives new levels being added.

## Code layout

```
src/core/      pure TypeScript rules: no Phaser
  engine.ts    board compilation, legal moves, exits/peels, ice, shifting gates
  solver.ts    exact A* (shortest solution) used for par, hints and stuck detection
  session.ts   move history, undo, star rules
  players.ts   simulated novice players (difficulty rating)
  audit.ts     "does every obstacle matter?" checks
src/game/      Phaser 4 scenes, procedural drawing, WebAudio synth, Capacitor wrappers
src/levels/    levels.json (shipped levels + solutions) and levels.lock.json (frozen hashes)
scripts/       level generator (tsx), icon generator, freeze tool
tests/         Vitest: rules, solver vs. brute force, every shipped level
e2e/           Playwright: plays levels on a Pixel 7 viewport with real touch drags
android/       Capacitor Android project (committed debug keystore)
```

## How levels are made

`npx tsx scripts/generate.ts [--only '^stone-'] [--climbs N] [--resume]`

For each of the 30 slots, the generator runs several simulated-annealing climbs in worker threads. Each candidate is scored by:

1. **Exact solve.** Par is the length of the shortest solution. We also measure how many moves are repositionings (not exits) and the longest run of setup moves before something can leave.
2. **Random play.** Hundreds of simulated novices: purely random, "eager" (always takes an exit when it can), and "one-move lookahead". A level is kept only when these usually fail within 1.5 × par + 2 moves. The thresholds tighten through each set of 5.
3. **Obstacle audit.** Each wall group, hole, one-way arrow, ice block, shell and shifting gate is neutralised in turn and the level re-solved. If par doesn't change, the obstacle is decoration. A shell must cost more than its own peel move. Decorative obstacles are stripped and the level re-evaluated from scratch; only levels whose remaining obstacles all matter (and that still contain their set's obstacle) can ship.
4. **Variety.** Upper caps on par and setup length keep levels hard rather than tedious. Selection also penalises repeating a neighbour's shape mix, board size, or where in the solution the key moment falls.

Slot specs and targets live in `scripts/lib/slots.ts` (waves of five that ramp like the first release, with a small bump per wave). One exception: level 150 (`shift-20`) ships as a near miss of its own targets: 6 repositions where 7 were wanted, and a 4% lookahead-novice success rate against a 3% cap.

Shipped levels are frozen with `npx tsx scripts/freeze.ts`. The tests then fail if a frozen level changes, and the generator never regenerates a frozen slot.

## Develop

```bash
npm install
npm run dev          # browser, http://localhost:5173  (?level=12 jumps to a level)
npm test             # rules + solver + every level (replays, re-proves par, audits obstacles)
npm run e2e          # Playwright touch playthroughs (add --shots 1,6 for screenshots)
npm run build && npx cap sync android && (cd android && ./gradlew assembleDebug)
```

CI (`.github/workflows/android.yml`) runs the tests and the web build on every push. On `main` it also builds the APK and republishes the `latest` pre-release. `versionCode` comes from `GITHUB_RUN_NUMBER`.
