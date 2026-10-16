import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import { HttpError } from '../errors.js';

export function errorHandler(config: Config): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', issues: error.issues.map(i => ({ path: i.path, message: i.message })) });
      return;
    }
    const rawCode = (error as { code?: unknown })?.code;
    const code = typeof rawCode === 'string' ? rawCode : undefined;
    const status = error instanceof HttpError ? error.status :
      code === '23505' || code?.startsWith('23') ? 409 :
      code === '57014' ? 408 : code?.startsWith('22') ? 400 :
      (error as { type?: string })?.type === 'entity.parse.failed' ? 400 :
      (error as { type?: string })?.type === 'entity.too.large' ? 413 : 500;
    const raw = error instanceof Error ? error.message : 'Operation failed';
    let message = raw.replaceAll(config.DB_PASSWORD, '[redacted]').replaceAll(config.ADMIN_API_TOKEN, '[redacted]');
    if (config.ADMIN_PASSWORD) message = message.replaceAll(config.ADMIN_PASSWORD, '[redacted]');
    res.status(status).json({ error: message });
  };
}
