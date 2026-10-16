import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { policiesController } from '../../controllers/policies/policies.controller.js';
import { managedDatabase } from '../../middleware/managed-database.js';

export function policiesRoutes(services: Services) {
  const router = Router({ mergeParams: true });
  const controller = policiesController(services);
  router.use(managedDatabase(services));
  router.get('/', controller.list);
  router.patch('/:schema/:table', controller.state);
  router.post('/:schema/:table/policies', controller.save);
  router.put('/:schema/:table/policies/:policy', controller.save);
  router.delete('/:schema/:table/policies/:policy', controller.remove);
  return router;
}
