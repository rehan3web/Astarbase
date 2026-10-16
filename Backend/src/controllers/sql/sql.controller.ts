import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Services } from '../../services/index.js';
import { dbName } from '../validation.js';

export function sqlController(services: Services) {
  return {
    async execute(req: Request, res: Response) {
      const body = z.object({ database: dbName, sql: z.string().min(1).max(60000) }).parse(req.body);
      await services.catalog.assertDatabase(body.database);
      res.json(await services.metrics.track(body.database, 'query',
        () => services.postgres.query(body.database, body.sql)));
    },
  };
}
