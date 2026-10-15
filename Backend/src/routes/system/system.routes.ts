import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { systemController } from '../../controllers/system/system.controller.js';

export function systemRoutes(services: Services) {
  const router = Router();
  router.get('/health', systemController(services).health);
  return router;
}
