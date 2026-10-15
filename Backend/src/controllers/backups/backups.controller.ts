import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Services } from '../../services/index.js';
import { HttpError } from '../../errors.js';
import { confirmation, dbName } from '../validation.js';

export function backupsController(services: Services) {
  return {
    async list(req: Request, res: Response) {
      const body = z.object({ database: dbName.optional() }).parse(req.query);
      res.json(await services.backups.list(body.database));
    },
    async create(req: Request, res: Response) {
      const body = z.object({ database: dbName, label: z.string().min(1).max(200).default('Manual backup') }).parse(req.body);
      res.status(201).json(await services.backups.create(body.database, body.label));
    },
    async restore(req: Request, res: Response) {
      const id = z.string().uuid().parse(req.params.id);
      const body = confirmation.extend({ database: dbName }).parse(req.body);
      if (body.confirmDatabase !== body.database) throw new HttpError(400, 'Confirm the exact database name to replace');
      res.json(await services.backups.restore(id, body.database));
    },
  };
}
