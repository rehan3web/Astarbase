import type { Request, Response } from 'express';
import type { Services } from '../../services/index.js';

export function systemController(services: Services) {
  return {
    async health(_req: Request, res: Response) {
      try { await services.health(); res.json({ status: 'ok' }); }
      catch { res.status(503).json({ status: 'unavailable' }); }
    },
  };
}
