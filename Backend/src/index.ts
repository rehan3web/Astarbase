import express from 'express';
import helmet from 'helmet';
import type { Config } from './config.js';
import { createServices, type Services } from './services/index.js';
import { authenticateAdmin } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { apiRoutes } from './routes/index.js';
import { systemRoutes } from './routes/system/system.routes.js';

export { createServices, type Services };
export function createApp(config: Config, services: Services = createServices(config)) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(systemRoutes(services));
  app.use('/api', authenticateAdmin(config), express.json({ limit: '1mb' }), apiRoutes(services));
  app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found' }));
  app.use(errorHandler(config));
  return app;
}
