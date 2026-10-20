# Sorabase Admin Backend

Sorabase's Node.js and TypeScript backend manages live PostgreSQL databases, branches, policies, backups, connections, and Studio metadata.

See the [main README](../README.md) for installation, the infrastructure diagram, security guidance, and password recovery.

## Responsibilities

- Execute SQL and serve live table/schema information.
- Apply record edits, table changes, and PostgreSQL RLS policies.
- Create database-per-branch copies and perform confirmed parent refreshes.
- Create and restore PostgreSQL backup archives and convert saved snapshots to SQL downloads.
- Provision isolated database-client credentials and manage selected-database maintenance.
- Read real PostgreSQL and Docker metrics, retaining telemetry in SQLite.
- Persist admin authentication, preferences, branch inventory, backups inventory, and saved queries.
- Inspect and configure the local PgBouncer service.

## Infrastructure boundaries

The backend is designed for a **single Linux Docker host**, not remote Docker or a managed PostgreSQL service.

| Connection | Transport |
| --- | --- |
| Next.js server → backend | Shared Admin API Unix socket |
| Backend → PostgreSQL | Shared PostgreSQL Unix socket |
| Backend → Docker Engine | `/var/run/docker.sock` through dockerode |
| Dump/restore operations | Commands inside the local PostgreSQL container |
| Backend → SQLite | Local filesystem |
| External clients → PostgreSQL/PgBouncer | Public ports with separate database-specific credentials |

The diagnostic HTTP port binds to host loopback in Compose. Keep it private. Internal admin credentials are not valid public client credentials.

Docker socket access is highly privileged. Never expose it to the browser or untrusted services.

## Persistent data

- **PostgreSQL:** application tables, rows, schemas, policies, and branch databases.
- **`Backend/data/`:** SQLite admin metadata plus private encrypted client-credential files.
- **`Backend/backups/`:** saved PostgreSQL dump archives.
- **`pooler-config` volume:** persistent PgBouncer settings.

SQLite is not an application-data database and does not store query result sets or plaintext database passwords. Saved SQL snippets are intentionally persisted as part of the query library.

Client credentials use encrypted private files. Preserve both the encrypted files and `client-credentials.key` when backing up `Backend/data/`; either alone is insufficient to recover passwords.

## Configuration and startup

Configure the root [`.env.example`](../.env.example) as `.env`. Start from the repository root:

```bash
docker compose up --build -d --wait
docker compose ps
docker compose logs --tail=100 studio
```

Compose initializes metadata, checks database access, and starts dependent services in healthcheck order. No manual host-side schema push is needed.

`ADMIN_API_TOKEN` is a private service credential. `SESSION_SECRET` is a separate frontend cookie-signing secret. The first-run admin account uses `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`; an existing account is not overwritten at startup.

Changing PostgreSQL credentials in `.env` does not automatically change credentials in an existing volume. Never delete volumes as a password-reset workaround.

## Operational behavior

- Branches share a PostgreSQL instance but have separate databases and client logins.
- Parent pulls replace child contents rather than merging changes.
- Reset, restore, pull, and deletion can be destructive and require explicit confirmation.
- Studio's privileged database role bypasses RLS. Verify row access using a non-superuser client.
- Main exposes shared pool-size configuration. PgBouncer's maximum client connections remain fixed at 200 globally.
- CPU and RAM measure the Postgres container, shared across branches; they are not whole-host or per-branch totals.
- Failed backend operations return errors instead of reporting simulated success.

## Source development

Requirements: Node.js 24+, pnpm 10.26.1, and local infrastructure matching the Unix-socket boundaries above.

Run these commands from the repository root:

```bash
pnpm install
pnpm --filter sorabase-backend typecheck
pnpm --filter sorabase-backend build
pnpm --filter sorabase-backend test
pnpm --filter sorabase-backend test:integration
pnpm --filter sorabase-backend test:recovery
```

Integration and recovery checks require local PostgreSQL binaries and Unix-socket support. They are not a substitute for validating the full Docker stack on a Docker-enabled Linux host.

For development with properly configured local infrastructure, `pnpm dev` runs the backend watcher. See [`.env.example`](.env.example) for backend-specific configuration.

## Troubleshooting

Inspect `docker compose logs studio postgres pgbouncer` and preserve the reported failing stage and error code when diagnosing startup.

- Missing socket: check shared volumes and service health.
- Docker access failure: check local socket availability and permissions.
- PostgreSQL `28P01`: verify the stored role password matches configuration.
- Missing backups: verify the archive mount and file availability; inventory alone does not prove an archive exists.

For internal password recovery, use the explicit maintenance procedure in the main README. Do not weaken network authentication, add TCP admin fallbacks, or delete database volumes.
