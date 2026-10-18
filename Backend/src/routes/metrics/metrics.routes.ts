import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { metricsController, serviceStatusController } from '../../controllers/metrics/metrics.controller.js';

export function metricsRoutes(services: Services) {
  const router = Router({ mergeParams: true });
  router.get('/', metricsController(services));
  router.get('/status', serviceStatusController(services));
  return router;
}
