import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { RankingService } from './service';
import { createRankingRouter } from '../routes/ranking.routes';
import { REPO_ROOT } from './seed';
import { createCustomerGraphRouter } from '../customer-graph/routes';

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
export function createDemoApp(service = new RankingService(), options: Parameters<typeof createRankingRouter>[1] = {}) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5000', 'http://127.0.0.1:5000'], credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/v1/health', (_req, res) => res.json({ success: true, mode: 'local-lead-ranking-demo', persistence: 'atomic-json', salesforce: 'synthetic' }));
  app.use('/api/v1/ranking', createRankingRouter(service, options));
  app.use('/api/v1/customer-graph', createCustomerGraphRouter());
  app.use('/api', (_req, res) => res.status(404).json({ message: 'API route not found' }));
  const frontend = path.join(REPO_ROOT, 'frontend/dist');
  if (fs.existsSync(frontend)) { app.use(express.static(frontend)); app.get('*', (_req, res) => res.sendFile(path.join(frontend, 'index.html'))); }
  return app;
}
if (require.main === module) {
  const service = new RankingService();
  const port = Number(process.env.PORT || 5000);
  const server = createDemoApp(service).listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Singtel lead-ranking demo: http://localhost:${port}`));
  const timer = process.env.DEMO_REAL_CLOCK === 'true' ? setInterval(() => { void service.advance(new Date().toISOString()).catch(err => console.error(err.message)); }, 30000) : null;
  const stop = () => { if (timer) clearInterval(timer); server.close(() => process.exit(0)); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
