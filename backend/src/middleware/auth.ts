import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env.js';

/**
 * Bearer token authentication middleware.
 * Validates API key from Authorization header against configured keys.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "
  const env = getEnv();

  if (!env.API_KEYS.includes(token)) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
