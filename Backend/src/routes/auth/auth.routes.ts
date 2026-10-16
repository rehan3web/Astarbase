import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { authController } from '../../controllers/auth/auth.controller.js';

export function authRoutes(services: Services) {
  const router = Router();
  const controller = authController(services);
  router.get('/status', controller.status);
  router.post('/login', controller.login);
  return router;
}
