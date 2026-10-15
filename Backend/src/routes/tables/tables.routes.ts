import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { tablesController } from '../../controllers/tables/tables.controller.js';
import { managedDatabase } from '../../middleware/managed-database.js';

export function databaseRoutes(services: Services) {
  const router = Router();
  router.get('/', tablesController(services).databases);
  return router;
}
export function tablesRoutes(services: Services) {
  const router = Router({ mergeParams: true });
  const controller = tablesController(services);
  router.use(managedDatabase(services));
  router.get('/', controller.list);
  router.get('/:schema/:table/rows', controller.rows);
  router.post('/:schema/:table/rows', controller.insert);
  router.patch('/:schema/:table/rows', controller.update);
  router.delete('/:schema/:table/rows', controller.remove);
  return router;
}
