import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { metricsController } from '../../controllers/metrics/metrics.controller.js';

export function metricsRoutes(services: Services) {
  const router = Router({ mergeParams: true });
  router.get('/', metricsController(services));
  return router;
}
