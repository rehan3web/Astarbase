import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Services } from '../../services/index.js';
import { dbName } from '../validation.js';
import { clientPassword } from '../../services/connection/password.js';

export function connectionController(services: Services) {
  const confirmedDatabase = (req: Request) => {
    const database = dbName.parse(req.params.database);
    const body = z.object({ confirmDatabase: dbName }).strict().parse(req.body);
    return body.confirmDatabase === database ? database : null;
  };
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
    async reset(req: Request, res: Response) {
      const database = dbName.parse(req.params.database);
      const body = z.object({ confirmDatabase: dbName, password: clientPassword }).strict().parse(req.body);
      if (body.confirmDatabase !== database) {
        res.status(400).json({ error: 'Confirm the exact database name' }); return;
      }
      headers(res);
      res.json(await services.clientRoles.reset(database, body.password));
    },
    async pool(req: Request, res: Response) {
      headers(res);
      res.json(await services.pooler.get(dbName.parse(req.params.database)));
    },
    async updatePool(req: Request, res: Response) {
      const body = z.object({ poolSize: z.number().int().min(1).max(80) }).strict().parse(req.body);
      headers(res);
      res.json(await services.pooler.update(dbName.parse(req.params.database), body.poolSize));
    },
    async resetDatabase(req: Request, res: Response) {
      const database = confirmedDatabase(req);
      headers(res);
      if (!database) { res.status(400).json({ error: 'Confirm the exact database name' }); return; }
      await services.catalog.assertDatabase(database);
      res.json(await services.maintenance.reset(database));
    },
    async terminate(req: Request, res: Response) {
      const database = confirmedDatabase(req);
      headers(res);
      if (!database) { res.status(400).json({ error: 'Confirm the exact database name' }); return; }
      await services.catalog.assertDatabase(database);
      res.json(await services.maintenance.terminate(database));
    },
  };
}
