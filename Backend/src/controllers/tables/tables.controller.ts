import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Services } from '../../services/index.js';
import { database, tableParams, object } from '../validation.js';

export function tablesController(services: Services) {
  return {
    async databases(_req: Request, res: Response) { res.json(await services.catalog.branches()); },
    async list(req: Request, res: Response) { res.json(await services.tables.list(database(req))); },
    async rows(req: Request, res: Response) {
      const { schema, table } = tableParams(req);
      const { limit, offset } = z.object({
        limit: z.coerce.number().int().min(1).max(1000).default(services.catalog.store.settings().defaultRowLimit),
        offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
      }).parse(req.query);
      res.json(await services.tables.rows(database(req), schema, table, limit, offset));
    },
    async insert(req: Request, res: Response) {
      const { schema, table } = tableParams(req);
      const body = z.object({ values: object }).parse(req.body);
      res.status(201).json(await services.tables.insert(database(req), schema, table, body.values));
    },
    async update(req: Request, res: Response) {
      const { schema, table } = tableParams(req);
      const body = z.object({ key: object, changes: object }).parse(req.body);
      res.json(await services.tables.update(database(req), schema, table, body.key, body.changes));
    },
    async remove(req: Request, res: Response) {
      const { schema, table } = tableParams(req);
      const body = z.object({ key: object }).parse(req.body);
      res.json(await services.tables.delete(database(req), schema, table, body.key));
    },
  };
}
