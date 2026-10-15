import type { Request, Response } from 'express';
import type { Services } from '../../services/index.js';
import { settingsSchema } from '../../db/admin-store.js';

export function settingsController(services: Services) {
  return {
    get(_req: Request, res: Response) { res.json(services.catalog.store.settings()); },
    update(req: Request, res: Response) {
      const changes = settingsSchema.partial().parse(req.body);
      res.json(services.catalog.store.updateSettings(changes));
    },
  };
}
