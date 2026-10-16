import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Services } from '../../services/index.js';
import { HttpError } from '../../errors.js';
import { branchName, confirmation } from '../validation.js';
import { branchTagSchema } from '../../db/admin-store.js';

export function branchesController(services: Services) {
  return {
    async list(_req: Request, res: Response) { res.json(await services.branches.list()); },
    async create(req: Request, res: Response) {
      const body = z.object({
        name: branchName.refine(name => name !== 'main', 'main is reserved'),
        parent: branchName.default('main'),
        tag: branchTagSchema.default('dev'),
      }).parse(req.body);
      res.status(201).json(await services.branches.create(body.name, body.parent, body.tag));
    },
    async updateTag(req: Request, res: Response) {
      const name = branchName.parse(req.params.name);
      const body = z.object({ tag: branchTagSchema }).strict().parse(req.body);
      res.json(await services.branches.updateTag(name, body.tag));
    },
    async refresh(req: Request, res: Response) {
      const name = branchName.parse(req.params.name);
      const branch = await services.catalog.branch(name);
      if (confirmation.parse(req.body).confirmDatabase !== branch.database_name) {
        throw new HttpError(400, 'Confirm the exact database name to replace');
      }
      res.json(await services.metrics.track(branch.database_name, 'branch-refresh',
        () => services.branches.refresh(name)));
    },
  };
}
