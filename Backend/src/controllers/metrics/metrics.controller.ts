import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Services } from '../../services/index.js';
import { dbName } from '../validation.js';

export function metricsController(services: Services) {
  return async (req: Request, res: Response) => {
    const database = dbName.parse(req.params.database);
    const { hours, limit } = z.object({
      hours: z.coerce.number().int().min(1).max(168).default(24),
      limit: z.coerce.number().int().min(1).max(720).default(240),
    }).strict().parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await services.metrics.read(database, hours, limit));
  };
}
