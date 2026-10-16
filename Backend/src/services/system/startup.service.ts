export type StartupStage = 'configuration' | 'compose' | 'admin-store' | 'admin-login' | 'docker' | 'database' | 'listeners';
const descriptions: Record<StartupStage, string> = {
  configuration: 'validating configuration',
  compose: 'starting Docker Compose',
  'admin-store': 'opening admin SQLite metadata',
  'admin-login': 'initializing admin password login',
  docker: 'checking Docker Unix socket and Postgres container',
  database: 'checking Postgres Unix socket and initializing metadata',
  listeners: 'opening Admin Unix socket and health listener',
};

export class StartupFailure extends Error {
  constructor(readonly stage: StartupStage, cause: unknown) {
    super('Startup step failed', { cause });
  }
}

export async function startupStep<T>(stage: StartupStage, operation: () => T | Promise<T>,
  log: (message: string) => void = console.info): Promise<T> {
  log(`[startup] ${descriptions[stage]}`);
  try { return await operation(); }
  catch (error) { throw new StartupFailure(stage, error); }
}

function redact(message: string, env: NodeJS.ProcessEnv): string {
  const secrets = new Set<string>();
  for (const [key, value] of Object.entries(env)) {
    if (!value || !/(?:PASSWORD|TOKEN|SECRET|PRIVATE_KEY|CREDENTIAL|DATABASE_URL|CONNECTION_STRING|API_KEY)/i.test(key)) continue;
    secrets.add(value);
    secrets.add(encodeURIComponent(value));
    secrets.add(JSON.stringify(value).slice(1, -1));
  }
  let result = message;
  for (const value of [...secrets].sort((a, b) => b.length - a.length)) {
    result = result.replaceAll(value, '[redacted]');
  }
  return result
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/(authorization\s*[:=]\s*)(?:basic|bearer)\s+\S+/gi, '$1[redacted]')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .slice(0, 1600);
}

/** Only sanitized messages and small error codes, never stacks or error objects. */
export function formatStartupFailure(error: unknown, env: NodeJS.ProcessEnv = process.env): string {
  const stage = error instanceof StartupFailure ? error.stage : 'startup';
  const cause = error instanceof StartupFailure ? error.cause : error;
  const details = cause && typeof cause === 'object' ? cause as { message?: unknown; code?: unknown; statusCode?: unknown } : {};
  const message = typeof details.message === 'string' ? details.message : 'Unknown startup error';
  const code = typeof details.code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(details.code) ? details.code : '';
  const status = typeof details.statusCode === 'number' && details.statusCode >= 100 && details.statusCode <= 599 ?
    `HTTP ${details.statusCode}` : '';
  const suffix = [code, status].filter(Boolean).join(', ');
  let hint = '';
  if (stage === 'configuration') hint = 'Check the named .env fields. DB_PASSWORD needs at least 16 characters and ADMIN_API_TOKEN at least 32. Do not share their values.';
  else if (stage === 'admin-store') hint = 'Check that Backend/data is writable and the existing SQLite file is accessible. Do not delete it.';
  else if (stage === 'docker') hint = 'Check the /var/run/docker.sock mount, local Docker permissions/API compatibility, and POSTGRES_CONTAINER.';
  else if (stage === 'database' && code === '28P01') hint = 'Postgres rejected the credentials. Changing .env does not change credentials inside an existing database volume; use the matching credentials. Do not delete volumes.';
  else if (stage === 'database') hint = 'Check the shared /var/run/postgresql volume and the existing project database. Do not delete volumes.';
  else if (stage === 'listeners') hint = 'Check the shared /var/run/astarbase volume permissions and whether the health port is already in use.';
  return redact(`Startup failed [${stage}]${suffix ? ` (${suffix})` : ''}: ${message}`, env) +
    (hint ? `\nHint: ${hint}` : '') + '\nAdmin API not started. No TCP fallback is allowed.';
}
