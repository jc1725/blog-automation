import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { postsRouter } from './routes/posts';
import { healthRouter } from './routes/health';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(morgan('dev'));

  app.use('/health', healthRouter);
  app.use('/api/posts', postsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
