import dotenv from 'dotenv';
import path from 'node:path';

/** Isolated local workspace: representative accounts, real AI, recorded-only email. */
async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });
  Object.assign(process.env, {
    NODE_ENV: 'development', STORAGE_MODE: process.env.SHOWCASE_STORAGE_MODE === 'cloud' ? 'cloud' : 'memory', LOCAL_DEMO_MODE: 'true',
    HOSTED_PREVIEW: 'false', SALES_EMAIL_PROVIDER: 'mock', HOST: '127.0.0.1',
    PORT: process.env.SHOWCASE_PORT || '5217',
    CORS_ORIGIN: process.env.SHOWCASE_FRONTEND_ORIGIN || 'http://127.0.0.1:3217',
    AI_BASE_URL: process.env.FREELLMAPI_BASE_URL || 'http://127.0.0.1:31415/v1',
    AI_API_KEY: process.env.FREELLMAPI_API_KEY || '',
    AI_MODEL: process.env.SHOWCASE_AI_MODEL || 'auto', AI_PROTOCOL: 'chat_completions',
    AI_TIMEOUT_MS: '45000', AI_FREELLM_FALLBACK_ENABLED: 'false',
  });
  process.env.AI_MODELS_URL = process.env.AI_BASE_URL + '/models';
  delete process.env.AI_REASONING_EFFORT;

  // Import only after selecting storage and recorded-only email.
  const { initializeDatabases, closeDatabases } = await import('../config/database');
  await initializeDatabases();
  const { default: app } = await import('../app');
  const { seedPreviewCompanies } = await import('../ai-management/preview');
  if (process.env.SHOWCASE_FULL_DATA !== 'false') {
    const { seedShowcaseData } = await import('../demo/showcase');
    console.log(JSON.stringify(await seedShowcaseData()));
  }
  const seeded = await seedPreviewCompanies();
  const server = app.listen(Number(process.env.PORT), '127.0.0.1', async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${process.env.PORT}/api/v1/sales/demo/run`, { method: 'POST' });
      if (!response.ok) throw new Error(`Workflow preparation returned HTTP ${response.status}`);
      console.log(`Singtel Scout workspace ready: ${seeded.queued.length} queued accounts and a complete sales conversation.`);
      console.log(`API: http://127.0.0.1:${process.env.PORT}; AI model selection: ${process.env.AI_MODEL}; email: recorded test outbox.`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Workspace preparation failed.');
      server.close(); process.exitCode = 1;
    }
  });
  process.on('SIGTERM', () => server.close(() => void closeDatabases()));
  process.on('SIGINT', () => server.close(() => void closeDatabases()));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Startup failed.'); process.exitCode = 1; });
