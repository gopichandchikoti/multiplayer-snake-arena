# Test report (v1.0.0)

Machine: Windows 11 Home, Node 22.13.1, pnpm 11.28.3, Chromium installed by Playwright 1.64.1 (headless, software GL).
Everything marked **automated** was executed by the commands shown and passed on the dates in `FEATURE_LOG.md`.
Everything marked **manual** is stated as such. Anything not listed was not tested (see the last section).

## Summary

| Layer                                  | Command                                                                             | Result                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static checks                          | `pnpm lint`, `pnpm typecheck`                                                       | clean (complexity <= 10, cognitive <= 15, <= 4 params, <= 50 lines per function, <= 300 lines per file in production code, 120 columns, no `any`, no assertions) |
| Unit and integration                   | `pnpm test:coverage`                                                                | **350 tests pass** in 24 files (shared 96, server 98 including 6 real-network tests, client 156)                                                                 |
| Coverage (v8, four metrics, 90 % gate) | same                                                                                | **96.7 %** statements, **92.2 %** branches, **95.9 %** functions, **98.2 %** lines                                                                               |
| End to end                             | `pnpm exec playwright test`                                                         | **18 pass** (desktop 14, mobile 4) in about 1.4 minutes                                                                                                          |
| Real-network latency                   | `vitest apps/server/test/latency.test.ts`                                           | 6 pass; results below                                                                                                                                            |
| Load                                   | `pnpm exec tsx scripts/load-test.ts --rooms 16 --seconds 30`                        | results below                                                                                                                                                    |
| Production smoke                       | `node apps/server/dist/main.mjs` + Playwright on port 5730 in `NODE_ENV=production` | pass                                                                                                                                                             |

## Mandatory cases from the specification

| Case                                   | Device / browser                                | Steps                                                                                                    | Expected                                                                       | Actual                | Pass                              | Evidence                                                   |
| -------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------- | --------------------------------- | ---------------------------------------------------------- |
| Server simulation deterministic replay | Node (automated)                                | same seed and inputs run twice; different seed                                                           | identical world; different foods                                               | identical / different | Pass                              | `sim-rounds.test.ts` "determinism"                         |
| Collision rules                        | Node (automated)                                | wall, own body, other body (credit), head-on, swap, tail vacate, parked head, shield, order independence | per `GAME_RULES.md`                                                            | as expected           | Pass                              | `sim-collisions.test.ts`, `sim-effects.test.ts`            |
| Many clients join / leave / reconnect  | Node, real sockets (automated)                  | create, join, ready, drop, resume, replace socket, grace expiry                                          | seat kept for 15 s, then given up                                              | as expected           | Pass                              | `room.test.ts`, `http-gateway.test.ts`, latency "cut" test |
| Room expiry                            | Node (automated)                                | all drop; wait 60 s on a fake clock                                                                      | room removed; survives if someone returns                                      | as expected           | Pass                              | `room.test.ts` "empty rooms"                               |
| Duplicate packets                      | Node (automated)                                | same `seq` twice, lower `seq`                                                                            | ignored and counted                                                            | as expected           | Pass                              | `room.test.ts`, `http-gateway.test.ts`                     |
| Latency 50 / 150 / 300 ms              | Node, real sockets through a delay/jitter proxy | match with the client's real networking code                                                             | steering feels instant; results identical for both players                     | see table below       | Pass                              | `latency.test.ts`                                          |
| Packet loss                            | same                                            | 1.2 s stall; hard disconnect                                                                             | recovers; same seat                                                            | recovered; resumed    | Pass (modelled, see limitation 2) | `latency.test.ts`                                          |
| Input flooding                         | Node, real socket (automated)                   | 500 inputs at once; 80 garbage frames                                                                    | limiter drops excess; socket closed 1008 for garbage; other players unaffected | as expected           | Pass                              | `http-gateway.test.ts`                                     |
| Malformed messages                     | Node (automated)                                | bad JSON, extra keys, wrong types, oversize, binary, wrong version                                       | error codes or close codes per `PROTOCOL.md`                                   | as expected           | Pass                              | `http-gateway.test.ts`, `wire-protocol.test.ts`            |
| Nickname sanitisation                  | Node + Chromium (automated)                     | markup, control, bidi, zero-width, emoji, zalgo, reserved words; XSS payload as name                     | cleaned; only ever text; no script runs                                        | as expected           | Pass                              | `wire-protocol.test.ts`, E2E security test                 |
| Production bundle + server smoke       | Chromium on the built bundle                    | Playwright suite against `node apps/server/dist/main.mjs`                                                | all flows work, no console problems                                            | 18 / 18               | Pass                              | `e2e/*.spec.ts`                                            |

### Latency results (configured round trip vs measured, with 10 % jitter)

| Configured RTT | Measured RTT | Jitter | Own snake visibly turned after | Round result              |
| -------------- | ------------ | ------ | ------------------------------ | ------------------------- |
| 50 ms          | 61 ms        | 1 ms   | 46 ms                          | identical on both clients |
| 150 ms         | 175 ms       | 5 ms   | 79 ms                          | identical on both clients |
| 300 ms         | 347 ms       | 8 ms   | 48 ms                          | identical on both clients |

Measured RTT is a little above configured because the proxy adds its own timer overhead. Server tick lag over the run:
p50 8.3 ms, p99 15.7 ms.

### Load results (128 clients, 16 rooms of 8, 35 s, server and clients in one process)

Tick lag p50 6.7 ms / p99 15 ms / max 16 ms; snapshot delivery p50 8 ms / p99 17 ms; mean snapshot 1,242 bytes (about
19 kB/s per client at 15 Hz); 0 socket errors; 0 rate-limit hits at normal play; whole-process CPU 9 %; RSS 115 MB.

## Accessibility and responsive matrix

| Case                                                                                                         | Device / browser                  | Expected                                                 | Actual                                                     | Pass | Evidence                                                             |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ---- | -------------------------------------------------------------------- |
| axe (WCAG 2 A/AA, 2.1 A/AA, 2.2 AA) on menu, settings, help, practice setup, online menu, leaderboard, lobby | Chromium, light and dark          | no violations                                            | none                                                       | Pass | `a11y-security.spec.ts`                                              |
| Colour contrast of every token pair, three schemes                                                           | Node (automated)                  | text >= 4.5:1, controls and focus >= 3:1                 | met                                                        | Pass | `state-format-tokens.test.ts`                                        |
| Snake outline vs each arena board                                                                            | Node (automated)                  | >= 3:1                                                   | met                                                        | Pass | same                                                                 |
| Keyboard-only flow, skip link, dialog focus trap, Escape, focus return                                       | Chromium                          | possible without a mouse                                 | as expected                                                | Pass | E2E                                                                  |
| Reduced motion                                                                                               | Chromium `prefers-reduced-motion` | animation durations ~0                                   | ~0                                                         | Pass | E2E                                                                  |
| 200 % text at 320 px, menu / online menu / lobby                                                             | Chromium                          | no horizontal scroll                                     | **failed at first (160-186 px overflow); fixed**; now none | Pass | E2E, `scripts/overflow-probe.mjs`                                    |
| Phone layout (Pixel 5 emulation), 320 x 568                                                                  | Chromium emulation                | no horizontal scroll, pad >= 44 px, board turned upright | as expected                                                | Pass | `mobile.spec.ts`, screenshots in `docs/screenshots/e2e-mobile-*.png` |
| Swipe steering without page scroll                                                                           | Chromium touch events             | steers; `scrollY` stays 0                                | as expected                                                | Pass | `mobile.spec.ts`                                                     |
| CSP / headers / cross-origin socket / path traversal / 405                                                   | Chromium + Node                   | refused                                                  | refused                                                    | Pass | `a11y-security.spec.ts`, `units.test.ts`                             |

## Defects found by testing (all fixed)

| Found by              | Defect                                                                                                                    | Severity                    | Fix                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| Playwright 200 % text | Menu, online menu and inputs overflowed a 320 px screen (grid min-content, intrinsic input width)                         | Medium (WCAG 1.4.10 reflow) | `minmax(0, 1fr)` columns, full-width inputs, wrapping headings |
| UI test               | Swipe handler captured the pointer even for presses on overlay buttons, which would have broken "Resume" in real browsers | Medium                      | ignore presses that start on interactive elements              |
| UI test               | Modal focus started on "Close" instead of the first control                                                               | Low                         | focus first content control                                    |
| Visual check          | Mobile layout was wider than the screen because the HUD forced the grid column wider                                      | High                        | `minmax(0, 1fr)`, wrapping HUD                                 |
| Visual check          | Steering pad covered the player's snake                                                                                   | Medium                      | pad moved to its own row below the arena                       |
| Contrast test         | Violet pattern marks were 2.83:1 on their fill                                                                            | Low                         | darker mark colour                                             |
| Lobby screenshot      | "(you) · host" clipped on a phone                                                                                         | Low                         | wrapping lobby names                                           |
| Load script           | clients re-sent "ready" on every room update and tripped the rate limiter                                                 | test tooling                | send once per round                                            |

## Unresolved issues

None known at severity Medium or above. Low: see `KNOWN_LIMITATIONS.md` (for example the headless-GPU warning, audio never
heard by a person, and the straight-coasting snake during a reconnect).

## Not tested

Real mobile devices and networks; Safari and Firefox; a real GPU or frame-rate measurement; audio by ear; Core Web Vitals;
Docker image build; GitHub Actions run; deployment behind a real TLS proxy; screen readers (NVDA, VoiceOver) by hand.

## Fresh-clone verification

Run on commit `53d396d` (later commits change documentation only), cloned with `git clone` into an empty directory outside
the project (path without spaces), with the browser already present in the shared Playwright cache:

| Step                             | Result                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/bootstrap.mjs`     | dependencies installed from the lockfile in about 10 s                                                                     |
| `pnpm verify`                    | lint clean, format clean, typecheck clean, 350 tests pass, coverage 96.65 / 92.18 / 95.92 / 98.19 %, build ok (1 min 30 s) |
| `pnpm exec playwright test`      | 18 passed (1 min 30 s)                                                                                                     |
| `node apps/server/dist/main.mjs` | `/healthz` returned `{"status":"ok"}`, `/` returned 200                                                                    |

Not exercised: the download of the browser itself (`bootstrap.mjs --browsers`) because Chromium was already cached.
