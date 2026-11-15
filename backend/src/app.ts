import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './routes/index';
import demoRoutes from './demo/routes';
import { allowedOrigins as originList } from './config/http';
import { AppError } from './utils/errors';

const app: Application = express();
app.set('trust proxy', env.TRUST_PROXY_HOPS);

// ----- Security headers -----
app.use(helmet());

// ----- CORS -----
const allowedOrigins = originList(env.CORS_ORIGIN, env.NODE_ENV === 'production');

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new AppError('This website is not an allowed frontend origin.', 403, 'ORIGIN_NOT_ALLOWED'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    exposedHeaders: ['X-Knowledge-Editable'],
  })
);

// ----- Body parsing -----
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ----- Request logging -----
app.use(requestLogger);

// ----- API routes -----
if (env.LOCAL_DEMO_MODE && env.NODE_ENV !== 'production') app.use(`/api/${env.API_VERSION}`, demoRoutes);
app.use(`/api/${env.API_VERSION}`, apiRouter);

// ----- Root -----
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Enterprise Radar AI — Backend API',
    version: env.API_VERSION,
    docs: `/api/${env.API_VERSION}/health`,
  });
});

// ----- Centralized error handler (must be last) -----
app.use(errorHandler);

export default app;
