import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin.split(','), credentials: true }));
  // Límite amplio: la restauración de respaldos puede subir JSON grandes
  // (incluyen imágenes clínicas embebidas como data-URL).
  app.use(express.json({ limit: '100mb' }));

  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.use('/api', routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
