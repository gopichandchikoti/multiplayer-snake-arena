# Threat model

Scope: the public game server and the browser client as shipped in this repository. No accounts, no payments, no
personal data beyond a chosen nickname and a random guest ID.

## Assets

1. **Fairness of results**: scores and winners must only come from the simulation.
2. **Availability** of rooms for honest players.
3. **Resume tokens**: whoever holds one can take over that player's seat for 15 s after a drop.
4. **Privacy**: nicknames and guest IDs; no emails, IPs are not stored (they are held in memory only for connection limits).

## Trust boundaries

Browser -> internet -> server. Everything from the client is untrusted input, including nicknames, room codes, message
sequence, timing and frequency. The server is trusted with the truth; the client validates what it receives anyway.

## Threats and mitigations

| #   | Threat                                                                    | Mitigation                                                                                                                                                        | Evidence                                                                                                              |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Cheating: send positions, scores or collision results                     | The protocol has no such fields; strict schemas reject extra keys; the server steps its own world                                                                 | `wire-protocol.test.ts` (rejects `x`, `y`, `score`), `http-gateway.test.ts`                                           |
| 2   | Impossible movement: reversing into the neck, queue stuffing, speed hacks | Turn rules live in the simulation; at most 2 queued turns; speed comes only from server state                                                                     | `sim-movement.test.ts` input rules                                                                                    |
| 3   | Replayed or duplicated inputs                                             | `seq` must exceed the last accepted one; duplicates counted and ignored                                                                                           | `room.test.ts`                                                                                                        |
| 4   | Message flooding, oversized frames, garbage                               | 2 KiB frame limit, token buckets, violation counter that closes the socket, per-IP socket cap                                                                     | `http-gateway.test.ts` (garbage flood, input flood, oversized, binary); load test shows 0 limiter hits at normal play |
| 5   | Cross-site WebSocket hijacking                                            | `Origin` must match the page host (or an allow-list); in production a missing `Origin` is refused                                                                 | `units.test.ts`, E2E "another origin cannot open a socket"                                                            |
| 6   | XSS through nicknames, room codes, URLs                                   | Nicknames sanitised (NFKC, no control/bidi/zero-width/markup/emoji); React renders text only; invite codes validated to `[A-Za-z0-9]{5}`; CSP `script-src 'self'` | E2E XSS test, `wire-protocol.test.ts`                                                                                 |
| 7   | Clickjacking, MIME sniffing, referrer leaks                               | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, COOP/CORP same-origin, restrictive Permissions-Policy               | E2E header assertions                                                                                                 |
| 8   | Path traversal in static serving                                          | Any `..` segment or NUL after decoding is refused; resolved path must stay under the web root                                                                     | `units.test.ts`, `http-gateway.test.ts`                                                                               |
| 9   | Seat theft with a resume token                                            | Tokens are 192-bit random, never logged (redacted), only honoured while the seat is held; a second socket with the token replaces the first (the old one is told) | `room.test.ts`, `units.test.ts` (redaction)                                                                           |
| 10  | Resource exhaustion: many rooms, many sockets, slow readers               | Room cap, per-IP cap, spectator cap, empty-room expiry, slow-consumer skip and drop thresholds                                                                    | `room.test.ts`, gateway code                                                                                          |
| 11  | Leaderboard pollution                                                     | Only server-computed results of rounds with at least two players are recorded; entries are keyed by a random guest ID that is never shown; capped at 5000 entries | `leaderboard-session.test.ts`                                                                                         |
| 12  | Information leakage in errors and logs                                    | Stable error codes with fixed text; JSON logs with secret-key redaction; stack traces never sent                                                                  | `units.test.ts`                                                                                                       |
| 13  | Corrupt or hostile leaderboard file                                       | Validated with a schema on load; corrupt files are renamed aside                                                                                                  | `leaderboard-session.test.ts`                                                                                         |
| 14  | Dependency compromise                                                     | Exact pinned versions and a lockfile; pnpm blocks install scripts except an explicit allow-list (`esbuild`)                                                       | `pnpm-workspace.yaml`                                                                                                 |

## Residual risks (accepted, documented)

- **Guest identity is not authenticated.** Anyone can choose any nickname (reserved names such as "admin" are refused,
  look-alike characters are not folded). Leaderboard entries are keyed by a private random ID, not by name.
- **No TLS in the app.** Terminate TLS in a reverse proxy; the server honours `X-Forwarded-Proto` for HSTS only, and
  `X-Forwarded-For` only when `TRUST_PROXY=true`.
- **Single process.** A crash or restart ends running matches; a resume token does not survive it.
- **Volumetric DoS** is out of scope for the application and belongs to the network edge.
- **Head-of-line blocking:** WebSocket runs on TCP, so a lossy link shows up as stalls rather than lost packets.
- Chat does not exist in v1, so there is no abusive-text surface other than nicknames.
