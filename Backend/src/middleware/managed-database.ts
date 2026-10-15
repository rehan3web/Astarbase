import type { RequestHandler } from 'express';
import type { Services } from '../services/index.js';
import { database } from '../controllers/validation.js';

export function managedDatabase(services: Services): RequestHandler {
  return async (req, _res, next) => {
    await services.catalog.assertDatabase(database(req));
    next();
  };
}
