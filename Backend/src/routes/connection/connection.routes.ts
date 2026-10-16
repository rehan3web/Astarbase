import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { connectionController } from '../../controllers/connection/connection.controller.js';

export function connectionRoutes(services: Services) {
  const router = Router({ mergeParams: true });
  const controller = connectionController(services);
  router.get('/', controller.get);
  router.post('/reveal', controller.reveal);
  router.post('/reset', controller.reset);
  router.get('/pool', controller.pool);
  router.patch('/pool', controller.updatePool);
  return router;
}
