# Protocol and API contract

Protocol version **1**. Source of truth: `packages/shared/src/protocol.ts` (strict `zod` schemas; unknown keys are
rejected in both directions).

## HTTP (GET and HEAD only; anything else is `405`)

| Path               | Result                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/healthz`         | `200 {"status":"ok"}` while the process is up                                                                                                 |
| `/readyz`          | `200 {"ready":true}` once the leaderboard is loaded and the socket is listening, else `503`                                                   |
| `/api/stats`       | `{uptimeSeconds, rooms, players, connected, counters{...}, tickLagMs{samples,p50,p99,max}}`; counts only, no personal data                    |
| `/api/leaderboard` | `{persistence: "memory" or "file", scope: "this-server", since, entries: [{rank, nick, wins, matches, bestScore, totalScore}]}`; no guest IDs |
| everything else    | the built client; unknown paths without a file extension get `index.html`; other unknown paths `404`                                          |

Every response carries the headers listed in `docs/THREAT_MODEL.md`.

## WebSocket `/ws`

Text frames only, one JSON object each, at most **2048 bytes**. The first message must be `hello` within 5 s.

### Client to server

| `type`        | Fields                                    | Notes                                                      |
| ------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `hello`       | `v:1, nick, guestId, resume?`             | `resume` is the token from an earlier `welcome`            |
| `quickplay`   |                                           | joins the fullest open public lobby, ready; else opens one |
| `create_room` | `visibility` (private or public), `theme` |                                                            |
| `join_room`   | `code, spectate?`                         | code is 5 characters, case-insensitive                     |
| `ready`       | `ready: boolean`                          | lobby and countdown only                                   |
| `set_theme`   | `theme`                                   | host, lobby only                                           |
| `leave_room`  |                                           | forfeits the snake if a match is running                   |
| `input`       | `seq: int >= 1, dir: 0..3`                | `seq` must increase within a round; duplicates are ignored |
| `ping`        | `t: number`                               | echoed in `pong`                                           |

### Server to client

| `type`      | Fields                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `welcome`   | `playerId, nick, resume, serverTime, resumed` (`nick` is the sanitised name actually used)                                  |
| `room`      | `room`: a RoomView or null (code, phase, visibility, theme, hostId, players[], countdownEndsAt, matchStartedAt, maxPlayers) |
| `snapshot`  | `tick, time, ends, snakes[], foods[], powerUps[], ack{slot:seq}, events[]`                                                  |
| `round_end` | `reason, endedAtTick, winnerSlots, standings[], names{slot:nick}, ranked`                                                   |
| `pong`      | `t, st` (server time)                                                                                                       |
| `error`     | `code, message`                                                                                                             |
| `bye`       | `reason`: server_shutdown, replaced, idle or kicked                                                                         |

A snake travels as `{s slot, a alive, d dir, q queued turns, h [x,y] head, p path, g grow, c countdown, sc score, k kills,
sg surge ticks, ag aegis ticks}`. `p` has one character per body segment (`0..3` = direction from the previous cell), so
100 segments cost 100 bytes. A full 8-player snapshot averaged 1.36 kB in the load test.

### Error codes

`bad_message`, `bad_nickname`, `unsupported_version`, `rate_limited`, `room_not_found`, `room_full`, `not_in_room`,
`already_in_room`, `not_host`, `wrong_phase`, `session_expired`, `server_busy`.

### Close codes

| Code | Meaning                                                                |
| ---- | ---------------------------------------------------------------------- |
| 1001 | server shutting down (a `bye` is sent first)                           |
| 1003 | binary frame received                                                  |
| 1008 | unsupported protocol version, or too many invalid / excessive messages |
| 1009 | frame larger than 2048 bytes                                           |
| 4000 | no `hello` within 5 s                                                  |
| 4001 | replaced by a newer connection with the same resume token              |

### Limits

| Limit               | Value                                                                |
| ------------------- | -------------------------------------------------------------------- |
| Frame size          | 2048 bytes                                                           |
| Control messages    | 10 per second, burst 20 (excess answered with `rate_limited`)        |
| Inputs              | 40 per second, burst 40 (excess dropped silently)                    |
| Violations          | more than 60 bad or excess messages in 10 s closes the socket (1008) |
| Sockets per address | 8 (configurable)                                                     |
| Rooms               | 200 (configurable), 8 players and 16 watchers per room               |
| Reconnect grace     | 15 s; empty rooms expire after 60 s                                  |
| Heartbeat           | ping every 10 s; no pong by the next beat terminates the socket      |
