# Feature log

Newest first. Never put secrets or personal data here.

## [2026-11-03] Milestone 1: deterministic core and offline practice vertical slice

**Type**: Feature
**Author**: agent

### What changed

* `@snake/shared`: seeded fixed-tick simulation (movement, order-independent crashes, food, pellets, power-ups,
  scoring, round end), path codec, strict wire protocol schemas, nickname sanitiser, client-prediction helper, bots.
* `@snake/client`: Vite + React shell, Phaser arena (patterned snakes, three arena themes, effects, synthesised sounds),
  offline practice against 1-7 bots, HUD, settings, help, summary, keyboard/swipe/pad input, portrait layout that
  turns the arena a quarter turn, reduced-motion and colour-scheme settings.

### Why

The simulation is the part everything else depends on, so it was built and verified first, and the practice mode proves
the same code drives a real playable game in the browser.

### Files touched

`packages/shared/**`, `apps/client/**`, root tooling (`eslint.config.js`, `vitest.config.ts`, `tsconfig*.json`),
`docs/DESIGN_REFERENCES.md`, `docs/GAME_RULES.md`, `docs/adr/0001-stack-and-protocol.md`, `scripts/shoot.mjs`.

### Validation

* `pnpm -r typecheck`: clean. `pnpm exec eslint .`: clean (complexity <= 10, cognitive <= 15, <= 4 params, <= 50 lines
  per function, <= 300 lines per file, 120 columns).
* `pnpm exec vitest run --coverage`: 167 tests pass; statements 97.3 %, branches 92.0 %, functions 97.2 %, lines 99.1 %.
* `node scripts/shoot.mjs` against the Vite dev server (Chromium via Playwright): menu, setup and game screens at
  1280x800 and 360x740, screenshots in `docs/screenshots/`. The only console output is Chromium's headless-GPU
  "GPU stall due to ReadPixels" performance warning.
* Not verified: real GPU frame rate, audio output, real touch devices.

### Migration / Setup notes

`pnpm install` (pnpm 11 needs `pnpm approve-builds esbuild` once; the workspace file records it).
