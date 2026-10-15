import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { sqlController } from '../../controllers/sql/sql.controller.js';

export function sqlRoutes(services: Services) {
  const router = Router();
  router.post('/', sqlController(services).execute);
  return router;
}
