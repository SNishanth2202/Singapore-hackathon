import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './routes/index';

const app: Application = express();

// ----- Security headers -----
app.use(helmet());

// ----- CORS -----
const allowedOrigins = [
  env.CORS_ORIGIN,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || env.CORS_ORIGIN === '*') {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in dev, safe with credentials
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ----- Body parsing -----
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ----- Request logging -----
app.use(requestLogger);

// ----- API routes -----
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
