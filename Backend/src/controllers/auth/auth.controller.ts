import type { Request, Response } from 'express';
import type { Services } from '../../services/index.js';
import { loginSchema } from '../../services/auth/auth.service.js';

export function authController(services: Services) {
  return {
    status(_req: Request, res: Response) {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ configured: services.auth.configured() });
    },
    async login(req: Request, res: Response) {
      const body = loginSchema.parse(req.body);
      res.setHeader('Cache-Control', 'no-store');
      res.json(await services.auth.login(body.identifier, body.password));
    },
  };
}
