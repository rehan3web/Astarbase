# Admin Studio backend

Node.js + TypeScript backend connected to the Next.js Studio frontend.
The frontend uses a session-protected, server-side Unix-socket proxy; the admin
API token is never embedded in the browser bundle or stored in localStorage.

## Requirements and first run

Run on a **Linux Docker host**, with Docker Engine and the Compose v2 plugin.
Host Node.js and pnpm are not required: both images build and start through
Compose. SQLite uses Node's built-in module without a separate database service.
The host must provide `/var/run/docker.sock`. Do not use a
remote Docker context, Docker-in-Docker, or a remote Postgres service.

From the repository root:

```sh
cp .env.example .env
# Edit .env locally. Supply DB_NAME, DB_USER, DB_PASSWORD,
# and ADMIN_API_TOKEN. Do not commit that file.
docker compose up --build -d --wait
```

Use at least 16 characters for `DB_PASSWORD` and 32 for `ADMIN_API_TOKEN`. Choose
lowercase letters, digits, and underscores for database/user names, starting with
a letter. Single-quote `.env` values containing `$` or `#` so Compose does not
interpolate them.

Compose reads the root `.env` and starts Postgres, PgBouncer, the Admin API, and
the frontend. Once Postgres is ready, the API performs the idempotent `db:push`:
it initializes `Backend/data/admin.sqlite`, checks the project database using
the `.env` credentials over the shared Postgres Unix socket, and imports legacy
admin metadata if present, **before listening for requests**.
The API opens `/var/run/astarbase/admin.sock` on the shared volume before HTTP
health becomes ready. The frontend starts only after that healthcheck passes.
No separate install, DB push or frontend startup command is needed on the host.

Existing installations can keep `Backend/.env` and run
`docker compose --env-file Backend/.env up --build -d --wait` instead.
Optional developer commands `pnpm setup` / `pnpm dev` use root `.env` when present,
otherwise legacy `Backend/.env`; they do not start a second competing API.

The original repository had no ORM or application schema. `db:push` does not
create a Postgres control database or invent application tables. Create
application schemas using the SQL endpoint or your application's migration
tooling. Existing database volumes are never reset during startup.

## Folder structure and storage

```text
Backend/
  server.ts
  data/
    admin.sqlite                 # created at first run; ignored by Git
  backups/
    <backup-id>.dump              # actual pg_dump archives; ignored by Git
  src/
    index.ts                     # Express assembly only
    config.ts
    setup.ts
    controllers/
      sql/ tables/ branches/ visualizer/ backups/ settings/ system/
    routes/
      sql/ tables/ branches/ visualizer/ backups/ settings/ system/
    services/
      admin/ tables/ branches/ visualizer/ backups/ docker/
    middleware/
    db/
      admin-store.ts             # SQLite settings and inventory
      socket.ts                  # Postgres Unix-socket client
      push.ts                    # startup initialization and safe legacy import
  test/
```

SQLite stores only admin configuration and branch/backup inventory. It never
stores application table data, SQL result sets, dump contents, database
passwords, or API tokens. Actual schemas and data stay in Postgres; dump archives
stay in `Backend/backups/`. The API container bind-mounts `Backend/data/` so the
SQLite file survives rebuilds. Short SQLite transactions use WAL mode; long
database operations still use a Postgres advisory lock, not a long SQLite write
transaction.

On upgrade from the previous Postgres admin catalog, `LEGACY_CONTROL_DB` (default
`astarbase_control`, accepting the old `CONTROL_DB` setting) is read once and its
inventory imported atomically into SQLite. The old database is **not deleted**.
The old `postgres-backups` volume remains mounted read-only as an upgrade source;
Postgres startup copies existing dump archives into `Backend/backups/`, without
overwriting different files or deleting originals. Do not run the old and new
backend versions concurrently during this one-time migration.

Changing `DB_USER`/`DB_PASSWORD` in `.env` does not change credentials already saved
inside an existing Postgres data volume. Rotate them using PostgreSQL and update
the configuration together. Never remove the data volume to change a password.

To inspect the running services:

```sh
docker --host unix:///var/run/docker.sock compose ps
curl --fail http://127.0.0.1:8000/health
docker --host unix:///var/run/docker.sock compose logs studio
```

## Networking and trust

| Caller | Target | Transport |
| --- | --- | --- |
| Admin SQL, dump, file listing, restore | Docker Engine | `/var/run/docker.sock` via dockerode |
| `psql`, `pg_dump`, `pg_restore` in the Postgres container | Postgres | `/var/run/postgresql/.s.PGSQL.5432` |
| Admin table editor, ERD, branch DDL/job locks | Postgres | Same kernel Unix socket on shared volume |
| Admin settings and branch/backup inventory | SQLite | Local `Backend/data/admin.sqlite` file |
| PgBouncer | Postgres | Same shared Unix socket |
| External clients | Postgres | Public host port `5432` |
| External clients | PgBouncer | Public host port `6432` |
| Local Studio/reverse proxy | Admin API | Loopback host port `8000` |

All four services join the same Docker network. There are **no hostname,
connection-URL, or TCP fallbacks** in the Admin database client or Docker client.
`DOCKER_SOCKET` and `PG_SOCKET_DIR` reject other values. Healthcheck HTTP/TCP probes
only check the API/PgBouncer listeners; they do not carry Admin-to-Postgres traffic.

PgBouncer uses `[databases] * = host=/var/run/postgresql port=5432`. Its Docker entrypoint is native TypeScript
on Node.js 24, runs as a non-root user, and replaces itself with PgBouncer after
writing private config files. No Python runtime or build step is required.

PgBouncer forwards the requested database name, so `branch_dev` works without
configuration reloads.
Its initial SCRAM-authenticated login is `DB_USER`; new database roles require
corresponding PgBouncer authentication configuration. It uses transaction pooling;
use the direct Postgres port for session-bound clients and migrations.

**Security:** Public database ports are explicitly exposed as requested. SCRAM
protects authentication, but the default stack does **not** encrypt external SQL
traffic. Configure TLS and restrict host firewall rules before accepting Internet
traffic. Do not distribute the superuser `DB_USER` credentials to untrusted
clients. Docker socket access is effectively host-root access: keep the Admin API
loopback-bound and behind a trusted, authenticated HTTPS reverse proxy if remote
administration is needed. The API token intentionally authorizes arbitrary SQL
and destructive operations; it is not an untrusted-user SQL sandbox.

## API

Except `GET /health`, every backend endpoint requires:

```http
Authorization: Bearer <ADMIN_API_TOKEN>
Content-Type: application/json
```

Never embed the token in browser JavaScript or a `NEXT_PUBLIC_*` variable. Call
these endpoints from an authenticated Studio server-side route. Cross-origin
browser requests are rejected. The connected frontend proxies `/api/studio/*`
over `/var/run/astarbase/admin.sock` on the `admin-socket` volume. The API TCP
listener remains for healthchecks and authenticated, loopback-bound diagnostics;
the frontend does not use it.

Compose also starts the frontend on `http://127.0.0.1:5000`. Sign in there using
`ADMIN_API_TOKEN` from your own `.env` (or legacy `Backend/.env`). The server exchanges it for a
signed, HttpOnly, SameSite session valid for eight hours. No unauthenticated
request can use the token-injecting proxy. On an HTTPS deployment, set
`STUDIO_COOKIE_SECURE=true`. See the repository README for a test walkthrough.

### SQL runner

`POST /api/sql`

```json
{ "database": "astarbase", "sql": "SELECT * FROM public.users LIMIT 100" }
```

Returns `{stdout, stderr, format: "csv", durationMs}`. `stdout` contains psql CSV
results and command tags; multiple statements retain their separate outputs.
`stderr` contains notices. SQL errors return non-2xx. Queries run through
`dockerode.exec` as argv, not a shell; psql startup files and interactive password
prompts are disabled, and psql backslash-command input is rejected. Default
statement timeout is 30 seconds, SQL limit is 60,000 bytes, and output is capped at
8 MiB. Use pagination or backups for large data.

### Table editor

- `GET /api/databases` — managed database/branch list.
- `GET /api/databases/:database/tables` — every non-system regular/partitioned table.
- `GET /api/databases/:database/tables/:schema/:table/rows?limit=100&offset=0`
  — columns, primary key, rows, total, and editable flag.
- `POST /api/databases/:database/tables/:schema/:table/rows`
  with `{"values":{"id":1,"name":"Alice"}}`.
- `PATCH` to the same rows URL with
  `{"key":{"id":1},"changes":{"name":"Updated"}}`.
- `DELETE` to the same rows URL with `{"key":{"id":1}}`.

Paging permits access to all rows without returning an unbounded response
(`limit` 1–1000). Counts use a consistent read snapshot. Composite primary keys
must include every key column. Tables without primary keys are readable and
insertable, but cannot be updated/deleted through the table API. Generated
columns are not writable. Identifiers are validated against the live catalog and
quoted; row values are parameterized. Encode schema/table URL segments.

### Branches

- `GET /api/branches`
- `POST /api/branches` with `{"name":"dev","parent":"main"}`.
- `POST /api/branches/dev/refresh` with `{"confirmDatabase":"branch_dev"}`.

Each branch is a **database**, never another container or schema. Names contain
1–48 lowercase letters/digits/underscores and start with a letter. `main` maps to
`DB_NAME`; `dev` maps to `branch_dev`. Branches can be based on other branches.

Creation takes a consistent `pg_dump` snapshot of the parent, creates an empty
database, and restores the snapshot. Parent connections are not terminated.
Refresh means a complete pull of the parent's current schema and data, **not a
merge**; it removes branch-only objects and overwrites branch changes.

Refresh/backup restore first populate a staging database. A failed restore leaves
the original intact. Only after successful restore are target sessions
disconnected and database names swapped transactionally. Clients must reconnect;
PgBouncer reconnects to the same database name. Cleanup failures return a
`cleanupWarning` naming any retained recovery database. Cluster roles and
database-level settings are not cloned; restored objects belong to `DB_USER`.
Server extensions must already be installed in the Postgres image.

### ERD

`GET /api/databases/:database/schema`

Returns `{database, nodes, edges}`. Nodes include columns, types, nullability,
defaults, generated/identity flags and ordered primary-key columns. Edges include
source/target schema, table and ordered column arrays, constraint name, update/
delete actions and deferrability. Composite and cross-schema foreign keys are
supported. Node IDs are JSON-encoded `[schema, table]` pairs to avoid collisions.

### Backups

- `POST /api/backups` with `{"database":"branch_dev","label":"Before migration"}`.
- `GET /api/backups?database=branch_dev` (filter optional).
- `POST /api/backups/:id/restore` with
  `{"database":"branch_dev","confirmDatabase":"branch_dev"}`.

Custom-format archives are created/listed/restored **inside the Postgres
container** through Docker exec. Creation directly executes:

```text
pg_dump --host /var/run/postgresql --username <DB_USER> --no-password \
  --format=custom --file /var/lib/astarbase/backups/<backup-id>.dump \
  --dbname <database>
```

No JavaScript SQL export or SQLite dump is used. The Postgres container path
`/var/lib/astarbase/backups` is bind-mounted to the host's **`Backend/backups/`**
folder, so the dump command writes the archive there directly.
Metadata lives in **`Backend/data/admin.sqlite`**; listing checks actual files via Docker and reports `available`
and `actual_size_bytes`. Restore may target any managed database and requires its
exact name as confirmation, including for main. Clone/refresh/backup/restore jobs
are serialized using a Postgres advisory lock across API processes.

These are per-database logical backups, not whole-cluster/disaster-recovery
backups. Preserve the Postgres data volume, `Backend/data/`, and
`Backend/backups/`, and copy archives off the machine separately for disaster
recovery. The backup directory is owned by the container's postgres OS user and
is mode 700; use appropriate host privileges when copying archives.
No operation runs `compose down -v`.

### Admin configuration settings

- `GET /api/settings`
- `PATCH /api/settings` with
  `{"projectName":"My project","defaultRowLimit":50,"theme":"dark"}`.

Settings persist in SQLite. `defaultRowLimit` (1–1000) is used by the table editor
when no `limit` query parameter is supplied. `theme` (`system`, `light`, `dark`)
and `projectName` are stored preferences for Studio clients. Only these keys are
accepted; unknown keys, credentials and row payloads are rejected.

## Verification

```sh
pnpm --filter astarbase-backend typecheck
pnpm build
pnpm test
# Requires local initdb, pg_ctl, psql, pg_dump and pg_restore, not Docker:
pnpm --filter astarbase-backend test:integration
```

The integration suite creates an isolated temporary Postgres cluster with TCP
disabled and tests real CRUD, composite-key ERD, branch isolation, nested parents,
refresh, failed-restore preservation, backup restoration and non-destructive
legacy metadata migration to SQLite. Unit tests cover SQLite persistence and
settings validation. The integration suite uses a test-only
local process adapter for Docker commands. It does **not** prove Docker Engine,
image builds, PgBouncer container startup, or host port/firewall behavior. Those
must be checked by starting this Compose stack on a Docker-enabled Linux host.
