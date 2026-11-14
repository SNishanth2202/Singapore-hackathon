import assert from 'node:assert/strict';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import app from '../app';

/** Exercises the actual Express routes without requiring MongoDB or Neo4j. */
async function verify() {
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}/api/v1/ai`;
    const modelResponse = await fetch(`${base}/models`);
    const models = await modelResponse.json() as { success: boolean; code?: string; data?: { count: number } };
    assert.equal(modelResponse.status, 200, `Model-list HTTP ${modelResponse.status}; ${models.code ?? 'unknown error'}`);
    assert.equal(models.success, true);
    console.log('Backend model-list request passed. Available entries:', models.data?.count);
    const response = await fetch(`${base}/test`, { method: 'POST', signal: AbortSignal.timeout(125000) });
    const result = await response.json() as { success: boolean; code?: string; data?: { model: string; reply: string } };
    assert.equal(response.status, 200, `Generation HTTP ${response.status}; ${result.code ?? 'unknown error'}`);
    assert.equal(result.success, true);
    assert.ok(result.data?.reply.trim(), 'Expected a nonempty model reply');
    console.log('Backend AI test passed. Model:', result.data?.model);
    console.log('Reply:', result.data?.reply.slice(0, 160));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

verify().catch((error: Error) => {
  console.error('AI verification failed:', error.message);
  process.exitCode = 1;
});
