import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'net';
import { createDemoApp } from '../src/ranking/demo-server';
import { RankingService } from '../src/ranking/service';
import { replayEvents } from '../src/ranking/seed';

test('HTTP queue, replay, failure, validation and empty contracts', async () => {
  const app = createDemoApp(new RankingService(null), { mode: 'rules' }), server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/ranking`;
  const call = async (route: string, body?: unknown) => {
    const response = await fetch(root + route, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    const first = await call('/queue'); assert.equal(first.status, 200); assert.equal(first.body.items.length, 11);
    for (const e of replayEvents.slice(0, 4)) assert.equal((await call('/demo/events', e)).status, 200);
    const q = await call('/queue'); assert.equal(q.body.items[0].id, 'O01'); assert.equal(q.body.items[0].rankingConfidence.score, 100);
    const failure = await call('/sources/refresh', { simulateFailure: true });
    assert.equal(failure.status, 200); assert.equal(failure.body.degraded, true); assert.deepEqual(failure.body.items, q.body.items);
    assert.equal((await call('/queue?view=invalid')).status, 400);
    assert.equal((await call('/demo/events', { ...replayEvents[3], aggregateVersion: 99 })).status, 409);
    assert.equal((await call('/demo/clock', { asOf: 'invalid' })).status, 400);
    assert.equal((await call('/opportunities/missing/decision')).status, 404);
    const empty = await call('/demo/reset', { empty: true }); assert.deepEqual(empty.body.items, []); assert.equal(empty.body.initialized, true);
    const meta = await call('/demo'); assert.equal(meta.body.crm.contracts.length, 8);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
