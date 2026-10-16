import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Services } from '../../services/index.js';
import { database, tableParams } from '../validation.js';

const identifier = z.string().min(1).refine(value => !value.includes('\0') && Buffer.byteLength(value) <= 63, 'Use a PostgreSQL identifier of at most 63 bytes');
const expression = z.string().trim().min(1).max(16384).nullable();
export const policyInput = z.object({
  name: identifier, command: z.enum(['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  mode: z.enum(['PERMISSIVE', 'RESTRICTIVE']), roles: z.array(identifier).min(1).max(100),
  usingExpression: expression, checkExpression: expression,
}).strict().superRefine((policy, context) => {
  if (policy.command === 'INSERT' && policy.usingExpression !== null) context.addIssue({ code: 'custom', path: ['usingExpression'], message: 'INSERT policies accept WITH CHECK only' });
  if (['SELECT', 'DELETE'].includes(policy.command) && policy.checkExpression !== null) context.addIssue({ code: 'custom', path: ['checkExpression'], message: 'SELECT and DELETE policies accept USING only' });
});
const stateInput = z.object({ enabled: z.boolean().optional(), forced: z.boolean().optional() }).strict()
  .refine(value => value.enabled !== undefined || value.forced !== undefined, 'Provide enabled or forced');

export function policiesController(services: Services) {
  const headers = (res: Response) => res.set('Cache-Control', 'no-store');
  return {
    async list(req: Request, res: Response) {
      headers(res); res.json(await services.policies.list(database(req)));
    },
    async state(req: Request, res: Response) {
      const { schema, table } = tableParams(req);
      headers(res); res.json(await services.policies.state(database(req), schema, table, stateInput.parse(req.body)));
    },
    async save(req: Request, res: Response) {
      const { schema, table } = tableParams(req);
      const previous = req.params.policy === undefined ? undefined : identifier.parse(req.params.policy);
      headers(res); res.status(previous === undefined ? 201 : 200)
        .json(await services.policies.save(database(req), schema, table, policyInput.parse(req.body), previous));
    },
    async remove(req: Request, res: Response) {
      const { schema, table } = tableParams(req);
      headers(res); res.json(await services.policies.remove(database(req), schema, table, identifier.parse(req.params.policy)));
    },
  };
}
