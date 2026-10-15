import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { visualizerController } from '../../controllers/visualizer/visualizer.controller.js';

export function visualizerRoutes(services: Services) {
  const router = Router({ mergeParams: true });
  router.get('/', visualizerController(services).diagram);
  return router;
}
