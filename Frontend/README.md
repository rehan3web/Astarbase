# Astarbase Studio frontend

The Next.js UI is connected to the backend; it has no mock database fallback.
Run the full stack from the repository root using the instructions in `../README.md`.

## Features

- Shared live branch selection for SQL, tables, ERD and backups.
- SQL execution with CSV results, real errors, timing and complete raw output.
- Paginated table reads, cell updates, inserts, deletes and schema DDL through SQL.
- Branch creation and explicitly confirmed parent refresh.
- Backup creation, live Docker file availability and explicitly confirmed restore.
- SQLite-backed admin settings.

Unknown/unsupported schema-menu actions direct you to SQL instead of reporting a
fake success. Charts are disabled rather than displaying sample graphs. The plain
SQL editor works without a CDN; Monaco is optional.

## Security and transport

Sign in using the admin token configured on your own server. It is exchanged for
an eight-hour signed HttpOnly session; it is not persisted in localStorage.
`app/api/studio/[...path]/route.ts` validates that session, checks mutation origins,
and injects the server-only token into requests sent over the shared Admin API
Unix socket. No Postgres password or Docker socket is mounted into the frontend.
There is no HTTP/TCP or dummy-data fallback for backend requests.

Compose supplies `ADMIN_API_TOKEN` from the root `.env` (or legacy `Backend/.env`)
and sets `ADMIN_SOCKET_PATH` automatically. Start everything with just
`docker compose up --build -d --wait` after configuring `.env`; no host Node.js,
pnpm or manual DB push is needed. Backups lives under **Settings → Backups** only.
For standalone frontend development, `pnpm dev:studio` from the
repository root serves port 5000. Supply frontend environment values securely
(see `.env.example`) and arrange access to the same local Admin Unix socket. If
not configured, the UI reports that fact; if the socket is absent, it reports the
backend is unavailable.

## Checks

```sh
pnpm --filter studio typecheck
pnpm --filter studio test
pnpm --filter studio build
pnpm --filter studio test:integration
```

The browser integration test requires local PostgreSQL binaries and Chromium
(`CHROMIUM_PATH` overrides its executable path). Build first. It starts isolated
real Postgres, the real backend API on a temporary Unix socket, and production
Next.js on port 5100. It tests normal sign-in, SQL results/errors, table editing,
ERD, branch isolation, backups/restores, parent refresh, settings and sign-out.
It uses a **test-only** local adapter for Docker commands, not a production
fallback. Full Docker/PgBouncer startup still requires a Docker-enabled host.
