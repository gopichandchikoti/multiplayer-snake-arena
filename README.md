# Coilyard: Multiplayer Snake Arena

Fast snake duels for 2 to 8 players, with a server that decides every move, crash and score. Play online in public or
private rooms, watch a round, or practise offline against bots. No account, no tracking.

**Status:** v1.0.0, built from `07`-style spec "Multiplayer Snake Arena v1.0". Web application only (no APK).
**Stack:** TypeScript (strict), Phaser 3.90 and React 19 client, Node 22 + `ws` server, one shared deterministic
simulation package, Vite 8, Vitest 5, Playwright 1.64.

![Practice board](docs/screenshots/e2e-practice-game.png)

## Quick start

Requires Node 22.12 or newer and pnpm 11.

```bash
git clone <this repo> && cd multiplayer-snake-arena
node scripts/bootstrap.mjs --browsers   # installs dependencies (+ Chromium for the E2E tests)
pnpm dev                                # http://127.0.0.1:5720  (game server on 5721)
```

Production build and run:

```bash
pnpm build
pnpm start                              # http://127.0.0.1:5722 (client and WebSocket on one port)
```

Open two browser tabs, choose **Play online**, create a room in one, join it with the code in the other, press **Ready**.

## How to play

Steer with the arrow keys or W A S D, by swiping on the arena, or with the on-screen pad (shown by default on touch
devices). **P** pauses practice, **M** mutes. Eat apples (10) and golden apples (30), make others crash into your body
(40), be the last snake alive (60). Surge, Aegis and Trim power-ups appear on the board. Most points after 120 seconds
wins. Full rules and the reasoning behind the numbers: [docs/GAME_RULES.md](docs/GAME_RULES.md).

## Commands

| Command                                              | What it does                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                           | client dev server (5720) and game server (5721)                                                           |
| `pnpm build` / `pnpm start`                          | production build; run it on 5722                                                                          |
| `pnpm lint` / `pnpm format:check` / `pnpm typecheck` | static checks (complexity <= 10, cognitive <= 15, <= 4 parameters, <= 50 lines per function, 120 columns) |
| `pnpm test` / `pnpm test:coverage`                   | 350 unit and integration tests; coverage gate 90 % on four metrics                                        |
| `pnpm e2e`                                           | builds, then runs the Playwright suite on port 5730 against the production bundle                         |
| `pnpm load -- --rooms 16 --seconds 40`               | load test: 16 rooms x 8 real clients                                                                      |
| `pnpm verify`                                        | lint, format check, typecheck, coverage tests, build                                                      |

## Verified results (this machine, Windows 11, Node 22.13.1, Chromium via Playwright)

- 350 Vitest tests pass; coverage 96.7 % statements, 92.2 % branches, 95.9 % functions, 98.2 % lines.
- 18 Playwright tests pass (desktop and mobile projects), including axe accessibility scans of every main screen in light and dark.
- Real-network latency tests at 50, 150 and 300 ms round trip: the player's own snake visibly turns within 46 to 79 ms.
- Load test, 128 clients in 16 rooms: server tick lag p99 15.7 ms, 0 socket errors.

Details, the test matrix and what was **not** tested: [docs/TEST_REPORT.md](docs/TEST_REPORT.md) and
[docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

## Configuration

Environment variables, with defaults, in [.env.example](.env.example) and [docs/RELEASE.md](docs/RELEASE.md). Nothing needs a secret.

## Repository layout

```
packages/shared   seeded simulation, protocol schemas, codec, bots, prediction   (no I/O)
apps/server       HTTP + WebSocket server, rooms, matches, leaderboard
apps/client       React UI + Phaser arena + networking
e2e/              Playwright suite          scripts/   bootstrap, load test, screenshots
docs/             architecture, protocol, threat model, rules, test report, ADR, design references
```

## Documentation

[Architecture](docs/ARCHITECTURE.md) | [Protocol and API](docs/PROTOCOL.md) | [Threat model](docs/THREAT_MODEL.md) |
[Game rules](docs/GAME_RULES.md) | [Feature matrix](docs/FEATURE_MATRIX.md) | [Test report](docs/TEST_REPORT.md) |
[Release](docs/RELEASE.md) | [Known limitations](docs/KNOWN_LIMITATIONS.md) | [Design references](docs/DESIGN_REFERENCES.md) |
[ADR 0001](docs/adr/0001-stack-and-protocol.md) | [Feature log](FEATURE_LOG.md)

## Privacy

The page stores your settings, a random guest ID and local records in your browser's `localStorage`. The server keeps rooms
in memory and, optionally, win/score totals under that guest ID (never shown). There is no telemetry, no analytics and no
third-party request: fonts and sounds are bundled or synthesised.

## Credits

Fonts: Bricolage Grotesque and Instrument Sans (SIL Open Font License, via Fontsource). All art and sound are generated in
code. The Coilyard name and mark are original to this project.
