// Explicit local sample-data preview; does not initialize or modify either database.
process.env.LOCAL_DEMO_MODE = 'true';
process.env.NODE_ENV = 'development';
process.env.STORAGE_MODE = 'memory';
import app from '../app';
import { env } from '../config/env';
const server = app.listen(env.PORT, '127.0.0.1', () => {
  console.log(`Sample preview: http://127.0.0.1:${env.PORT}. Temporary memory storage; no cloud database connection. Use npm start for Atlas/Aura storage.`);
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
