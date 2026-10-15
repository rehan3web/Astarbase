import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { branchesController } from '../../controllers/branches/branches.controller.js';

export function branchesRoutes(services: Services) {
  const router = Router();
  const controller = branchesController(services);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.post('/:name/refresh', controller.refresh);
  return router;
}
