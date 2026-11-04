# Release and deployment

Version **1.0.0**. This is a web application; there is no APK or installer.

## Build

```bash
pnpm install --frozen-lockfile      # or: pnpm bootstrap
pnpm build                          # client (Vite) then server (esbuild)
```

| Output | Path                                           | Measured                                                                                                                |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Client | `apps/client/dist/` (`index.html`, `assets/*`) | JS 1,592,418 bytes (436,753 gzip), 13 MB with source maps                                                               |
| Server | `apps/server/dist/main.mjs`                    | 958,733 bytes, SHA-256 `a5fb2af759221806015b37d9234700df2ba2f744d138adfc17f7aea97af98b24` (at commit b3d46fd plus docs) |

Toolchain used: Node 22.13.1, pnpm 11.28.3, TypeScript 5.9.3, Vite 8.3.5, Phaser 3.90.0, React 19.3.1, `ws` 8.22.1.
Hashes change with any source change; record your own with `sha256sum apps/server/dist/main.mjs`.

## Run

```bash
pnpm start          # production server on http://127.0.0.1:5722, serves apps/client/dist
```

The server finds the client in `../../client/dist` next to its bundle (or `STATIC_DIR`). Configuration is by environment
variable (see `.env.example`); invalid values stop the process at startup with a JSON error naming the setting.

| Variable                              | Default             | Purpose                                                    |
| ------------------------------------- | ------------------- | ---------------------------------------------------------- |
| `PORT`, `HOST`                        | `5722`, `127.0.0.1` | listen address (`0.0.0.0` inside a container)              |
| `NODE_ENV`                            |                     | `production` refuses sockets without an `Origin` header    |
| `ALLOWED_ORIGINS`                     | same host           | comma separated browser origins allowed to open the socket |
| `LEADERBOARD_FILE`                    | memory              | path of a JSON file that survives restarts                 |
| `STATIC_DIR`                          | auto                | directory holding the built client                         |
| `MAX_CONNECTIONS_PER_IP`, `MAX_ROOMS` | 8, 200              | abuse limits                                               |
| `ROUND_TICKS`                         | 1800                | round length in ticks (15 per second)                      |
| `TRUST_PROXY`                         | false               | read the client address from `X-Forwarded-For`             |
| `LOG_LEVEL`                           | info                | `debug                                                     | info | warn | error` |

Ports used by this project: dev client 5720, dev server 5721, production 5722, Playwright 5730.

## Hosting prerequisites

- A host that can run a long-lived Node 22 process and keep WebSocket connections open (a container platform or a VM; not
  a function-per-request platform).
- TLS in front of it. Example reverse proxy for nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:5722;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 120s;
}
```

then run the app with `TRUST_PROXY=true` and `ALLOWED_ORIGINS=https://your.host`.

- One instance only (state is in memory). Probes: liveness `/healthz`, readiness `/readyz`.
- `Dockerfile` is included but **unverified** (see KNOWN_LIMITATIONS).

## Operating

- Logs are one JSON object per line on stdout (`msg` values such as `server_listening`, `room_created`, `match_start`,
  `match_end`, `player_disconnected`, `ws_origin_refused`). Secrets are redacted.
- `GET /api/stats` shows rooms, sockets, counters and tick lag; alert if `tickLagMs.p99` stays above ~50 ms.
- Back up `LEADERBOARD_FILE` if you use it; it is a small JSON document written atomically.
- Shutdown: `SIGTERM`/`SIGINT` tell clients (`bye`), close sockets with 1001 and flush the leaderboard.

## Rollback

Keep the previous `apps/server/dist/main.mjs` and `apps/client/dist/` together and swap both. The protocol carries a version
number; a client with a different version is refused with `unsupported_version` and the page shows the server's "reload the page" message.
There are no data migrations.

## Fresh-clone checklist

1. `git clone <repo> && cd <repo>`
2. `node scripts/bootstrap.mjs --browsers`
3. `pnpm verify` (lint, format check, typecheck, tests with the 90 % gate, build)
4. `pnpm exec playwright test`
5. `pnpm start`, open http://127.0.0.1:5722, play a practice round, then open two tabs and play online.

The result of running this on a real clone is recorded in `docs/TEST_REPORT.md`.
