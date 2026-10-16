import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Services } from '../../services/index.js';
import { dbName } from '../validation.js';

export function connectionController(services: Services) {
  const headers = (res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
  };
  return {
    async get(req: Request, res: Response) {
      const database = dbName.parse(req.params.database);
      headers(res);
      res.json(await services.connection.metadata(database));
    },
    async reveal(req: Request, res: Response) {
      const database = dbName.parse(req.params.database);
      z.object({}).strict().parse(req.body ?? {});
      headers(res);
      res.json(await services.connection.reveal(database));
    },
  };
}
