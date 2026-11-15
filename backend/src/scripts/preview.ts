// Sample commercial records use memory; graph operations reuse the configured shared Neo4j database.
process.env.LOCAL_DEMO_MODE = 'true';
process.env.NODE_ENV = 'development';
process.env.STORAGE_MODE = 'memory';
import app from '../app';
import { env } from '../config/env';
const server = app.listen(env.PORT, '127.0.0.1', () => {
  console.log(`Sample preview: http://127.0.0.1:${env.PORT}. Sample records use memory; graph features reuse the configured NEO4J connection. Use npm start for Atlas storage.`);
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
