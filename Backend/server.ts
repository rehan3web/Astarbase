import { loadConfig } from './src/config.js';
import { createApp, createServices } from './src/index.js';
import { pushDatabase } from './src/db/push.js';
import { startCompose } from './src/setup.js';
import { startAdminListeners } from './src/services/system/listener.service.js';

async function main() {
  const config = loadConfig();
  if (config.AUTO_START_COMPOSE === 'true') {
    // Host entry point: Compose owns the long-running API (and its DB push).
    await startCompose();
    return;
  }
  const services = createServices(config);
  try {
    await services.postgres.docker.ready();
    await pushDatabase(config, services.catalog.store);
    const listeners = await startAdminListeners(createApp(config, services), config.PORT);
    console.log(`Admin API ready on shared Unix socket; health listener on ${config.PORT}`);
    let closing = false;
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        if (closing) return;
        closing = true;
        listeners.close().then(() => { services.close(); process.exit(0); })
          .catch(() => { services.close(); process.exit(1); });
      });
    }
  } catch (error) {
    services.close();
    throw error;
  }
}
main().catch(() => {
  console.error('Startup failed. Check .env (or legacy Backend/.env), the local Docker daemon, and the shared Unix sockets. No TCP fallback is allowed.');
  process.exitCode = 1;
});
