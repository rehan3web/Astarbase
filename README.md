# Astarbase

Single-machine Admin Studio with a connected Next.js frontend, Node.js/TypeScript
backend, Postgres, PgBouncer, and SQLite admin settings.

The SQL Editor saves named snippets, SQL text, folders, favorites and
Private/Shared organization in the existing `Backend/data/admin.sqlite`.
Use **Save** (or Ctrl+S) to persist editor changes. New snippets and folders,
renames, favorites and visibility changes survive reloads and container
restarts through the existing admin-data volume. Deleting a folder keeps its
queries outside the folder. Private and Shared are authenticated Studio library
groups for this single-admin installation; Shared never means anonymous access.
Saving a snippet does not execute it; use **Run** separately.

### Dashboard metrics and retained history

Database size, selected-database connections and transaction/row-change activity
come from PostgreSQL over its shared Unix socket. CPU and working-set RAM come
from the **Postgres container**, using dockerode over `/var/run/docker.sock`;
these are shared across all branches, not per-branch CPU/RAM or whole-VPS usage.
Docker CPU uses counter deltas; 100% means one CPU core, so values can exceed 100%.
Connection limits are cluster-wide. Memory usage excludes inactive file cache.

The backend samples managed databases every 30 seconds even with the dashboard
closed. Numeric readings and query/branch-refresh event metadata persist in
`Backend/data/admin.sqlite` for 7 days, including across container restarts.
The dashboard offers 1h/24h/7d history and periodic refresh. Time buckets select
actual samples; gaps are never filled with invented data. Transaction rates
require two samples and reset their baseline when Postgres counters reset or a
database is recreated. Transactions are not SQL statement counts.

`GET /api/databases/:database/metrics?hours=24&limit=240` is authenticated.
`hours` accepts 1–168 and `limit` 1–720. Errors mark partial/stale readings rather
than producing fake zeros; old readings remain available within retention.
Activity events store only kind, time, duration and success/error—not SQL text,
credentials or query results. Saving an editor snippet is not a query event.
Metrics from before this feature was installed cannot be reconstructed.

The activity chart retains the original backup UI's striped stacked bars,
hover details and Runs/Rows switch. Runs aggregate all recorded Studio SQL and
branch-refresh events in the selected period (not just the latest event list):
successful operations under 1 second, slow successful operations, and failures.
Rows show observed insert/update/delete counter deltas, assigned to the bucket
in which each sample interval ends. Counter resets, recreated databases, missing
baselines and sampling gaps over 90 seconds are not treated as valid row activity.
Unobserved buckets remain empty rather than displaying fabricated activity.
The dashboard does not display the detailed telemetry tables or range controls;
readings and activity remain available in the API and retained in SQLite.
The chart starts with one left-aligned hourly column at the first recording,
adds a column each elapsed hour, and rolls at 24 columns. Its start time is
persisted per database in SQLite, so restarting the app or pruning old readings
does not reset the chart or insert blank columns before recording began.

### External client connections

The header **Connect** link opens `/connect` with Connection String,
Transaction Pooler, PSQL, and Parameters tabs for the selected branch.
Metadata uses the selected database's separate client role, branch database name, and public
Postgres/PgBouncer ports. Set `DATABASE_PUBLIC_HOST` to a public DNS name/IP
when clients need a different host from the Studio browser address; otherwise
the page uses the actual browser hostname for this same-machine deployment.
Compose forwards `POSTGRES_PUBLIC_PORT` and `PGBOUNCER_PUBLIC_PORT` to Studio,
so custom port mappings appear in the generated client strings.

Passwords are masked by default, never included in metadata reads, and only
returned by an authenticated, same-origin POST after **Show password** is
clicked, or transiently for an explicit **Copy snippet** action. Hide, tab changes, branch changes, and navigation clear the revealed
password from the view. Credentials are not saved in SQLite/browser storage.
The password is masked directly inside the snippet, not in a separate field.
**Copy snippet** and **Show password / Hide password** share the snippet footer.
Copy produces a usable connection string including the real password without
revealing it onscreen; copying credentials requires an explicit button click.
Parameters displays shell-compatible `PG*` environment assignments in one
editor. Default Compose connections do not enable TLS: use a trusted network
or a secure tunnel. These are external client examples, not an Admin Studio
TCP connection; admin operations remain on shared kernel Unix sockets.

### Database credentials and pool settings

Studio preferences are no longer shown in Database Settings. Each new branch,
including a child branch, gets a non-superuser login with the branch name and a
cryptographically random password. Main uses the separate `astarbase_main`
client login. Internal admin operations keep using `DB_USER` / `DB_PASSWORD`;
Settings never rotates that internal credential.

On upgrade, Studio provisions separate credentials for existing managed
databases without deleting data. Existing privileged `DB_USER` credentials
are not revoked: migrate external applications to the new Connect snippets.
Managed databases have public CONNECT revoked so a branch client cannot connect
to another managed database. Branch refresh/backup restore strips source ACLs
and reapplies the destination client's access; its password stays unchanged.
Existing roles with conflicting names are rejected, never adopted or reset.

In Settings, **Reset database password** opens a password-entry dialog for the
selected main, branch or child database only. Enter your own 16–256-character
password, or use **Generate a password** to fill an optional secure random value;
you can edit it before saving. Random initial passwords are still assigned
automatically when branches are created. Get the saved password using
**Connect → Show password** and update external clients.
Already-authenticated sessions can remain connected. PgBouncer uses a restricted
Postgres SCRAM authentication query, so new branch users and password changes
do not require editing a user list or restarting the pooler.

Client credentials are encrypted with AES-256-GCM in private files under
`Backend/data`, not in SQLite or browser storage. Back up the encrypted files
**and** their `client-credentials.key` together, securely; losing them prevents
Studio from recovering client passwords. Filesystem access to both can decrypt
the passwords. Preserve the existing admin-data directory when upgrading.

Only main displays the shared PgBouncer pool settings. Pool size accepts 1–80
server connections per user/database pair and reloads dynamically. It persists
in the `pooler-config` Docker volume across restarts. PgBouncer caps each
database/user at 80 server connections; overall Postgres capacity still applies.
**Max client connections is fixed at 200 across the entire pooler**, not 200
per branch, and is not writable through the API.

Upgrade all images together with `docker compose up -d --build` using your
existing `.env` and volumes. Do not use `down -v`. This upgrade requires a
privileged existing internal `DB_USER` to manage roles and the private pooler
authentication function; no new privileged admin roles are created.

Backend and PgBouncer startup logic use Node.js 24 + TypeScript. No Python
interpreter, scripts or dependencies are required by the Docker stack.

## Run and test on your Docker host

Requirements: Linux, local Docker Engine at `/var/run/docker.sock` and Docker
Compose v2. Use the local Docker context. **Host Node.js, pnpm, DB-push commands
and separate frontend/backend startup commands are not required.**

```sh
cp .env.example .env
# Fill DB_NAME, DB_USER, DB_PASSWORD, ADMIN_API_TOKEN,
# ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET locally.
# DB_PASSWORD: at least 16 characters. ADMIN_API_TOKEN: at least 32 characters.
docker compose up --build -d --wait
```

Compose automatically reads the root `.env`, builds both Node.js images, starts
Postgres and wildcard PgBouncer, initializes the admin SQLite metadata and checks
the project database with those credentials, opens the shared Admin API socket,
and then starts the frontend. Healthchecks enforce this order. Existing database
volumes, settings and backups are preserved on subsequent runs.

If you already configured the previous `Backend/.env`, keep it and instead run:

```sh
docker compose --env-file Backend/.env up --build -d --wait
```

Use `docker compose ps` and `docker compose logs studio frontend` to inspect
startup. For the legacy command, also pass `--env-file Backend/.env` to those
commands. Do not use `down -v` unless you intend to delete database volumes.

1. Open **http://YOUR_VPS_IP:5000** remotely, or **http://127.0.0.1:5000**
   on the Docker host (use your configured `STUDIO_PORT` if different).
2. Sign in with your **admin username or email and password**. On first startup,
   `ADMIN_USERNAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` (or legacy
   `Backend/.env`) create the admin account. Use a 3–48-character username,
   a valid email and a 12–256-character password. There is no default password
   or public registration. Only a salted scrypt password hash is saved in
   `Backend/data/admin.sqlite`; the browser receives an HttpOnly session cookie.
   Existing accounts are never overwritten on restart, so changing these
   bootstrap variables later does not reset the account. After initial setup
   you may remove `ADMIN_PASSWORD` from `.env`.
   Set a **new `SESSION_SECRET` of at least 32 characters**, different from the
   old login token, for private cookie signing. Never reuse `ADMIN_API_TOKEN`
   as `SESSION_SECRET`: old token holders must not be able to forge sessions.
   `ADMIN_API_TOKEN` remains a private server-to-server secret;
   it is not accepted as a Studio login. Existing token-login sessions must
   sign in again after this update.
3. Open SQL and run the following on `main`:

   ```sql
   CREATE TABLE public.studio_test (
     id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
     name text NOT NULL
   );
   INSERT INTO public.studio_test(name) VALUES ('first live row');
   SELECT * FROM public.studio_test;
   ```

4. In Table Editor, select `studio_test`, edit a cell, refresh, and verify the
   persisted value. Test insert/delete and pagination.
5. Create `dev` from `main` in Branches. Select `dev` using the header selector;
   it maps to database `branch_dev`. Changes there do not modify main. The
   Storage column reads each database's actual `pg_database_size`, not a sample
   or a shared Docker volume total.
6. Open Schema Visualizer to inspect live tables and foreign keys. **Copy as SQL**
   exports the active database's complete schema using Docker `pg_dump
   --schema-only`, including all user schemas, table definitions, identity
   columns, defaults, indexes and constraints, without row data. Graph schema
   selection does not restrict this SQL export. Copy supports HTTP deployments
   where the browser Clipboard API is unavailable.
7. Open **Settings → Backups**, create a backup on dev, modify dev's data, and
   restore the archive. Backups is not a main-sidebar item. Restore
   requires typing the exact target database name. Archives appear in
   `Backend/backups/` as real Docker `pg_dump` files. The backup actions menu
   downloads a plain `.sql` conversion of the saved snapshot using Docker
   `pg_restore`; it does not dump the current live database. Delete backup
   requires typing its exact backup ID and permanently removes the archive and
   SQLite metadata without changing the live database. Missing archives cannot
   be downloaded, but their stale metadata can still be deleted.
8. Pull/refresh dev from main when wanted. This **replaces dev's contents**, not a
   merge, and requires typing `branch_dev`. Target database clients disconnect.
9. Save Admin Settings and reload. Settings persist in
   `Backend/data/admin.sqlite`; actual user data stays in Postgres.

PgBouncer's wildcard database mapping routes every new branch without manual
entries or a reload. External clients use the Docker host on the configured
Postgres/PgBouncer public ports (defaults 5432/6432).

## Security

Studio's frontend is publicly bound to `0.0.0.0` (port 5000 by default), as requested.
The diagnostic API remains bound to the Docker host's loopback.
Restrict the Studio port to trusted IPs with host/provider firewall rules and use
a trusted HTTPS reverse proxy before sending credentials over the Internet. Enable
`STUDIO_COOKIE_SECURE=true` for HTTPS. Database ports are public as requested:
restrict host firewall rules and configure external TLS before Internet use.
The admin token permits arbitrary SQL and powerful Docker operations; protect it.

Browser → Next.js uses the Studio web session. Next.js → Admin API uses the shared
Admin Unix socket. Admin API → Postgres and Docker use kernel Unix sockets only.
There are no remote-database, TCP-admin, or mock-data fallbacks.

## Recover a forgotten database password without deleting data

Use this only when the original password is unavailable and startup reports
Postgres authentication error `28P01`. Set the desired password in your own `.env`
(`DB_PASSWORD`, at least 16 characters); do not paste it into chat or CLI arguments.
This changes the existing `DB_USER` role password cluster-wide. Existing external
clients must update their password. There will be maintenance downtime.

```sh
git pull origin main
docker compose build studio
docker compose stop -t 60 frontend studio pgbouncer postgres
docker compose run --rm --no-deps studio node dist/src/maintenance/reset-password.js --confirm-user astarbase_admin
# Only after "Password reset confirmed":
docker compose up -d --wait
```

Replace `astarbase_admin` with your configured `DB_USER` if different. With legacy
`Backend/.env`, pass `--env-file Backend/.env` to every Compose command.
The recovery command refuses a running Postgres server, reuses the exact same
Postgres image/data mount, runs standalone maintenance with networking disabled,
sends SQL only over private stdin, and suppresses raw SQL/Docker logs.
It does not initialize a new database, delete volumes, create roles, change role
privileges, or weaken `pg_hba.conf`. If it fails, keep Postgres stopped and inspect
the stated maintenance error; do not delete lock files or volumes.

## Verification

```sh
pnpm build
pnpm test
pnpm --filter astarbase-backend test:integration
pnpm --filter studio test:integration
```

These developer checks require Node.js 24+, pnpm 10.26.1 and `pnpm install`;
they are not needed to start the stack with Compose.
The integration suites use isolated real Postgres over Unix sockets. In the
browser suite, Docker commands are executed by a **test-only local adapter**;
this does not verify Docker image builds, PgBouncer startup, public port/firewall
behavior, or a production deployment. Validate those using `docker compose up --build -d --wait` on a
Docker-enabled Linux host.

See `Backend/README.md` and `Frontend/README.md` for API and component details.
