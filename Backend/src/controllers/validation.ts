import type { Request } from 'express';
import { z } from 'zod';

export const object = z.record(z.string(), z.unknown());
export const branchName = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/);
export const dbName = z.string().min(1).max(63);
export const confirmation = z.object({ confirmDatabase: dbName });
export const database = (req: Request) => dbName.parse(req.params.database);
export const tableParams = (req: Request) => z.object({
  schema: z.string().min(1).max(63), table: z.string().min(1).max(63),
}).parse(req.params);
