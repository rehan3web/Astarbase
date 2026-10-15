import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Config } from '../config.js';

const digest = (value: string) => createHash('sha256').update(value).digest();
export function authenticateAdmin(config: Config): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!timingSafeEqual(digest(token), digest(config.ADMIN_API_TOKEN))) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'Admin authentication required' });
      return;
    }
    if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) {
      res.status(403).json({ error: 'Cross-origin admin requests are not allowed' });
      return;
    }
    next();
  };
}
