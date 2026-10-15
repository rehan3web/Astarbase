import type { Request, Response } from 'express';
import type { Services } from '../../services/index.js';
import { database } from '../validation.js';

export function visualizerController(services: Services) {
  return {
    async diagram(req: Request, res: Response) {
      const db = database(req);
      await services.catalog.assertDatabase(db);
      res.json(await services.schema.diagram(db));
    },
  };
}
