# ADR 0001: Stack, protocol and testing choices

Status: accepted, 2026-11-03.

## Context

The spec asks for Phaser 3 + TypeScript + Vite on the client and an authoritative Node.js WebSocket/Socket.IO server,
with Redis and PostgreSQL optional. The target is a portfolio project that must be runnable on one machine with no
external services, verifiable end to end, and fair by construction.

## Decisions

1. **One shared, pure, seeded simulation (`@snake/shared`).** Server, client prediction and offline practice all call the
   same `stepWorld`. Consequences: replay tests are meaningful, practice mode cannot drift from online rules, and prediction
   can be unit-tested against the real thing.
   *Rejected*: separate client/server implementations (drift risk).
2. **Phaser 3.90.0, not Phaser 4.** `npm` `latest` for Phaser is 4.x now, but the spec says Phaser 3 and Phaser 4 changes
   rendering internals. Pinned to the last 3.x release.
3. **Plain `ws` with a typed, schema-validated JSON protocol, not Socket.IO.** The game needs ordered messages, our own
   reconnect tokens and exact control over message size and rate limiting. Socket.IO's polling fallback, packet framing
   and automatic reconnect would hide the things this project needs to show and test. The protocol has strict `zod`
   schemas on both ends (unknown keys rejected).
   *Cost*: reconnect, heartbeat and backoff are implemented here and tested.
4. **No Redis, no PostgreSQL in v1.** Both are optional in the spec. One Node process holds all rooms; the leaderboard
   is in memory or, optionally, a JSON file (`LEADERBOARD_FILE`). The UI states which one is active and never calls a
   per-server board "global". Horizontal scale is out of scope (see KNOWN_LIMITATIONS).
5. **React for menus/HUD, Phaser only for the arena.** Menus, forms, dialogs and the scoreboard need real semantic HTML,
   focus handling and screen-reader support, which a canvas cannot give. The two meet through one `GameSource` interface.
6. **Vitest + React Testing Library instead of Jest.** The rulebook names Jest; the repo is a Vite project and Vitest
   reuses its transform, so one config covers TS, JSX and ESM. The testing style (behaviour-first, RTL) is the same.
7. **TypeScript 5.9, ESLint 9.** TypeScript 7 and ESLint 10 were available, but `typescript-eslint` 8.72 supports
   TypeScript below 6.1, so 5.9.3 is used. Versions are pinned exactly.
8. **Fonts via Fontsource (SIL OFL)** because the Fontshare licence text could not be verified (see DESIGN_REFERENCES.md).
9. **Coverage exclusion, narrow and documented:** `apps/client/src/render/**` (Phaser drawing code) needs a real GL
   context and is exercised by Playwright instead. Everything else, including the Phaser host component, is under the
   90% four-metric gate.

## Consequences

Single-process servers are simple to run and test but cannot survive a restart mid-match or spread across machines.
Moving rooms to Redis would be the next step; the `Room` class already takes its clock and transport as parameters.
