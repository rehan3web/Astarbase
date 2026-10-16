import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { backupsController } from '../../controllers/backups/backups.controller.js';

export function backupsRoutes(services: Services) {
  const router = Router();
  const controller = backupsController(services);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.post('/:id/restore', controller.restore);
  router.get('/:id/download', controller.download);
  router.delete('/:id', controller.delete);
  return router;
}
