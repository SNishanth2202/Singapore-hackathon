// Explicit local sample-data preview; does not initialize or modify either database.
process.env.LOCAL_DEMO_MODE = 'true';
process.env.NODE_ENV = 'development';
import app from '../app';
import { env } from '../config/env';
const server = app.listen(env.PORT, '127.0.0.1', () => {
  console.log(`Local preview: http://127.0.0.1:${env.PORT}. Public research and seller knowledge are available; tracked sample companies are fictional.`);
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
