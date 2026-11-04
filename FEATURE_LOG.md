# Feature log

Newest first. Never put secrets or personal data here.

## [2026-11-03] Milestone 2: authoritative server, protocol and rooms

**Type**: Feature
**Author**: agent

### What changed

* `@snake/server`: one Node process serving the built client, `/healthz`, `/readyz`, `/api/stats`, `/api/leaderboard`
  and a `ws` WebSocket endpoint at `/ws`. Rooms (private codes, public quick play), ready state, countdown, fixed-tick
  matches, spectators, host migration, reconnect with a secret resume token and a 15 s grace period, round summary,
  per-server leaderboard (memory or JSON file, never called global).
* Abuse limits: strict message schemas, 2 KiB frames, per-connection token buckets, violation counter that closes the
  socket, per-IP connection cap, Origin check, hello timeout, heartbeat, slow-consumer protection, secrets redacted from
  JSON logs, path-traversal-proof static serving, CSP and other security headers.
* `apps/server/build.mjs` bundles the server to `apps/server/dist/main.mjs`.

### Why

The server is the authority on every position, collision and score; clients only send intent.

### Files touched

`apps/server/**`, `packages/shared/src/protocol.ts` (welcome carries the effective nickname), `.gitattributes`, `.editorconfig`.

### Validation

* `pnpm exec eslint .` clean; `pnpm -r typecheck` clean; 259 tests pass in total (92 server).
* Integration tests use real `ws` sockets against a real HTTP server with a hand-moved clock, so they are fast and
  deterministic: handshake, origin refusal, IP cap, hello timeout, malformed/oversized/binary frames, garbage flood,
  input flood, full lobby-to-leaderboard game, resume after a dropped socket, graceful shutdown.
* Smoke test of `node apps/server/dist/main.mjs` serving `apps/client/dist`: `/healthz` ok, index 200 with CSP.
* Not yet verified: behaviour under real network latency (Milestone 3), load (Milestone 5).

### Migration / Setup notes

None. Set `PORT`, `ALLOWED_ORIGINS`, `LEADERBOARD_FILE` as in `.env.example`.

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
