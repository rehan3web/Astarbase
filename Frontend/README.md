# Sorabase Studio

The Next.js frontend for Sorabase: a live PostgreSQL management interface, not a mock-data dashboard.

For the complete introduction, infrastructure diagram, and Docker installation, see the [main README](../README.md).

## Interface

- Dashboard with real database metrics and PostgreSQL, RLS, and PgBouncer status.
- Table Editor with record editing, filtering, pagination, structure controls, and read-only SQL definitions.
- SQL Editor with persisted query organization and JSON, CSV, and Markdown exports.
- Database branches, tags, parent pulls, and confirmed child deletion.
- Schema Visualizer with real foreign-key relationships and schema SQL export.
- PostgreSQL row-level security policy management.
- Connection snippets with masked passwords and explicit copy/reveal actions.
- Database settings and **Settings → Backups**.

The active database is shared across relevant screens through the header selector. Selecting a row in the Branches list selects its actions; it does not switch the active database.

## Authentication and backend access

Sign in with an admin **username or email and password**. There is no token-login UI.

The browser receives a signed HttpOnly session cookie. Server routes validate the session and mutation origins before calling the backend over the shared Admin API Unix socket. The private `ADMIN_API_TOKEN` authenticates server-to-server requests; it is not a user login or a browser-exposed credential.

The frontend does not mount the Docker socket or PostgreSQL password. Missing backend configuration and unavailable services produce explicit errors, not sample data.

## Run

Recommended: configure the root `.env` and run the complete stack from the repository root:

```bash
docker compose up --build -d --wait
```

For source development, install Node.js 24+ and pnpm 10.26.1, then run from the repository root:

```bash
pnpm install
pnpm dev:studio
```

The development server listens on `0.0.0.0:5000`. Configure private frontend environment values using [`.env.example`](.env.example) and provide access to the real backend Unix socket. Frontend development alone does not start PostgreSQL or the admin backend.

## Checks

Run from the repository root:

```bash
pnpm --filter studio typecheck
pnpm --filter studio test
pnpm --filter studio build
pnpm --filter studio test:integration
```

Browser integration checks require local PostgreSQL binaries and Chromium. Set `CHROMIUM_PATH` if needed. Build first: the suite starts production Next.js on port 5100, isolated real PostgreSQL, and the real API through a temporary Unix socket.

The fixture uses a test-only local adapter for Docker commands. It does not validate production Docker images, PgBouncer startup, network exposure, or firewall rules.
