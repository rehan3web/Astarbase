import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { settingsController } from '../../controllers/settings/settings.controller.js';

export function settingsRoutes(services: Services) {
  const router = Router();
  const controller = settingsController(services);
  router.get('/', controller.get);
  router.patch('/', controller.update);
  return router;
}
