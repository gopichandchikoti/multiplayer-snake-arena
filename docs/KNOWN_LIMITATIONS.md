# Known limitations

Written so nobody has to discover these by accident.

## Gameplay and networking

1. **Reconnecting keeps your seat, not your snake.** While a connection is down the server keeps the snake moving in its
   last direction (it cannot know what the player would do). On a 40-cell-wide board a straight snake hits a wall in
   about four seconds, so a drop of more than a few seconds usually costs that round's snake. The 15 s grace period means
   you rejoin the room and the lobby that follows, and your seat is not given to someone else.
2. **"Packet loss" is modelled, not real.** WebSocket runs on TCP, which retransmits invisibly. The tests model loss as a
   stall (1.2 s hold then release) and as a hard disconnect. Real-world lossy mobile links were not tested.
3. **Server timing on Windows.** Node timers there have about 15.6 ms granularity, so measured tick lag p99 is ~15.7 ms
   even when nothing is wrong. Linux hosts are typically finer; this was not measured here.
4. **Single process.** No horizontal scaling, no shared state; a restart ends running matches. Redis/PostgreSQL were
   optional in the spec and are not built.
5. **Leaderboard is per server.** In memory by default (resets on restart, and the UI says so); `LEADERBOARD_FILE` keeps it
   across restarts. Guest identity is unauthenticated.
6. **Matchmaking is simple.** Quick play fills the fullest open public lobby. No skill, region or latency matching.
7. **Public rooms need everyone to be ready** (quick play joins ready; a player who un-readies holds the start).

## Client and presentation

8. **Rendering was only checked in headless Chromium** (software GL). Real GPU frame rate, thermal behaviour on phones and
   Safari/Firefox were not tested. Chromium prints a harmless "GPU stall due to ReadPixels" performance note while Phaser
   builds textures in software GL; the E2E suite filters exactly that line and nothing else.
9. **Audio** is synthesised with Web Audio and was never listened to by a person; only "it does not throw" is verified.
10. **Bundle size**: the main script is 1.59 MB (437 kB gzip), almost all Phaser. Core Web Vitals and Lighthouse were not
    measured.
11. **Nicknames**: no profanity filter; look-alike (confusable) characters are not folded; zero-width joiners are removed,
    which affects some Persian and Indic names.
12. The page must be loaded once; there is no service worker, so offline practice works only while the tab is open.
13. A single `<canvas>` cannot be read by a screen reader. Gameplay is therefore announced through an `aria-live` region
    (own pickups, crashes, power-ups) and the scoreboard is real HTML, but the board itself has no text alternative.

## Tooling and process

14. **Docker and GitHub Actions files were written but never run** (Docker is not installed on the development machine and
    the repository was not pushed). Treat `Dockerfile` and `.github/workflows/ci.yml` as unverified starting points.
15. **Coverage exclusions (narrow, deliberate):** `apps/client/src/render/**` (Phaser drawing: needs a real GL context, covered
    by Playwright instead), and the two entry files `server/src/main.ts` and `client/src/main.tsx`. Everything else counts
    toward the 90 % four-metric gate.
16. **Lint exceptions (test files only):** `describe` callbacks exceed 50 lines, optional chaining on fixtures inflates the
    cyclomatic-complexity count, and test files may reach 400 lines. Production code meets all limits.
17. pnpm 11 blocks dependency install scripts by default; `esbuild` is allow-listed in `pnpm-workspace.yaml`.
18. The Playwright suite reads the canvas only indirectly ("is something drawn" by screenshot size, plus HUD text), because a
    WebGL canvas cannot be inspected pixel by pixel without extra tooling.
