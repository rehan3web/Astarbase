import { Router } from 'express';
import type { Services } from '../services/index.js';
import { sqlRoutes } from './sql/sql.routes.js';
import { tablesRoutes, databaseRoutes } from './tables/tables.routes.js';
import { branchesRoutes } from './branches/branches.routes.js';
import { visualizerRoutes } from './visualizer/visualizer.routes.js';
import { backupsRoutes } from './backups/backups.routes.js';
import { settingsRoutes } from './settings/settings.routes.js';
import { authRoutes } from './auth/auth.routes.js';
import { metricsRoutes } from './metrics/metrics.routes.js';
import { connectionRoutes } from './connection/connection.routes.js';
import { policiesRoutes } from './policies/policies.routes.js';

export function apiRoutes(services: Services) {
  const router = Router();
  router.use('/auth', authRoutes(services));
  router.use('/sql', sqlRoutes(services));
  router.use('/databases', databaseRoutes(services));
  router.use('/databases/:database/tables', tablesRoutes(services));
  router.use('/databases/:database/schema', visualizerRoutes(services));
  router.use('/databases/:database/metrics', metricsRoutes(services));
  router.use('/databases/:database/connection', connectionRoutes(services));
  router.use('/databases/:database/rls', policiesRoutes(services));
  router.use('/branches', branchesRoutes(services));
  router.use('/backups', backupsRoutes(services));
  router.use('/settings', settingsRoutes(services));
  return router;
}
