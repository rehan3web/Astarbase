import { loadConfig } from './src/config.js';
import { createApp, createServices } from './src/index.js';
import { pushDatabase } from './src/db/push.js';
import { startCompose } from './src/setup.js';
import { startAdminListeners } from './src/services/system/listener.service.js';
import { startupStep, formatStartupFailure } from './src/services/system/startup.service.js';

async function main() {
  const config = await startupStep('configuration', () => loadConfig());
  if (config.AUTO_START_COMPOSE === 'true') {
    // Host entry point: Compose owns the long-running API (and its DB push).
    await startupStep('compose', () => startCompose());
    return;
  }
  const services = await startupStep('admin-store', () => createServices(config));
  try {
    await startupStep('admin-login', () => services.auth.initialize());
    await startupStep('docker', () => services.postgres.docker.ready());
    await startupStep('database', () => pushDatabase(config, services.catalog.store));
    const listeners = await startupStep('listeners', () => startAdminListeners(createApp(config, services), config.PORT));
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
main().catch(error => {
  console.error(formatStartupFailure(error));
  process.exitCode = 1;
});
