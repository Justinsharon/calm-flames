/**
 * Simple in-memory fixed-window rate limiter per client IP (one Cloud Run instance = one window
 * store; enough to blunt abuse of public POSTs). Behind Cloud Run's front end the client IP is the
 * first X-Forwarded-For hop, which Express exposes as req.ip with `trust proxy` set.
 */
import type { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  name: string;
  windowMs: number;
  max: number;
}

const stores = new Map<string, Map<string, { count: number; resetAt: number }>>();

export function rateLimit({ name, windowMs, max }: RateLimitOptions) {
  const store = new Map<string, { count: number; resetAt: number }>();
  stores.set(name, store);
  return (req: Request, res: Response, next: NextFunction) => {
    // Test suites make many requests from one address; the limiter's own tests turn this off.
    if (process.env.RATE_LIMIT_DISABLED === '1') return next();
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let e = store.get(key);
    if (!e || e.resetAt <= now) {
      e = { count: 0, resetAt: now + windowMs };
      store.set(key, e);
    }
    e.count++;
    if (store.size > 10000) for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - e.count)));
    if (e.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((e.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    next();
  };
}

/** Tests: forget every counter. */
export function resetRateLimits() {
  for (const s of stores.values()) s.clear();
}
