import { Router } from 'express';
import { isDBConnected } from '../config/db';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const dbOk = isDBConnected();
  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'disconnected',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
