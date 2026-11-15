import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AddressInfo } from 'net';
import { CustomerDatabase, CustomerDatabaseSchema, checkCustomer, readCustomerDatabase } from '../src/ranking/customer-eligibility';
import { RankingService } from '../src/ranking/service';
import { makeSeed, replayEvents, readSources } from '../src/ranking/seed';
import { filterCustomerProposals } from '../src/ranking/extractor';
import { LlmQueueService } from '../src/ranking/llm-queue';
import { createDemoApp } from '../src/ranking/demo-server';
import { AppError } from '../src/utils/errors';
import { clone, QueueSnapshot } from '../src/ranking/contracts';
import { LeadAssessment, modelInput, OpenAiCredential } from '../src/ranking/openai-ranking';

const fixture = readCustomerDatabase();
const empty = (): CustomerDatabase => ({ ...clone(fixture), customers: [] });
const credential: OpenAiCredential = { apiKey: 'sk-test-not-a-real-key', model: 'test', namespace: 'eligibility-test', source: 'session' };
const blockedIds = ['O02', 'O06', 'O09', 'O16'];
const assertEligible = (q: QueueSnapshot) => {
  assert.ok(q.items.every(r => !checkCustomer(r, fixture).length));
  assert.ok(q.items.every(r => r.customerCheck?.result === 'not_found_in_mock_customer_database'));
  assert.deepEqual(q.items.map(r => r.rank), q.items.map((_, i) => i + 1));
};
const fakeAssessment = (q: QueueSnapshot) => ({ model: 'test', responseId: 'resp-test', rows: q.items.map(r => ({
  id: r.id, score: 70, priorityStatus: 'Urgent', confidence: 60, reason: 'Synthetic facts support a timely verification task.',
  confidenceReason: 'The supplied facts are bounded but need verification.', urgencyReasons: ['Known buying window'],
  confidenceReasons: ['Synthetic CRM facts'], evidenceIds: [r.evidence[0].id], verifyNext: 'Confirm the site assessment.',
} as LeadAssessment)) });

test('customer identity matches canonical IDs, legal suffix aliases and explicit parent groups without substring matches', () => {
  assert.ok(checkCustomer({ accountId: 'new-id', account: 'MICRON SINGAPORE PTE. LTD.', parent: 'Unrelated' }, fixture).length);
  assert.ok(checkCustomer({ accountId: 'ACC-2', account: 'Renamed entity', parent: '' }, fixture).length);
  assert.ok(checkCustomer({ accountId: 'new-id', account: 'New subsidiary', parent: 'Micron Technology, Inc.' }, fixture).length);
  assert.equal(checkCustomer({ accountId: 'other', account: 'Micron Consulting Services', parent: 'Other' }, fixture).length, 0);
  assert.equal(checkCustomer({ accountId: 'other', account: 'Different agency', parent: 'Ministry of Finance' }, fixture).length, 0);
  assert.equal(checkCustomer({ accountId: 'other', account: 'United Microelectronics Corporation', parent: '' }, fixture).length, 0);
  assert.throws(() => CustomerDatabaseSchema.parse({ ...fixture, customers: [...fixture.customers, fixture.customers[0]] }));
});

test('all queue views, same-universe comparisons and model inputs exclude publicly identified customers', () => {
  const s = new RankingService(null);
  for (const view of ['crm_plus_public', 'crm_only', 'deal_value'] as const) {
    const q = s.get(view); assert.equal(q.total, 11); assertEligible(q);
    assert.deepEqual(q.customerEligibility!.excluded.map(e => e.opportunityId).sort(), blockedIds);
    assert.ok(q.customerEligibility!.excluded.every(e => e.sourceUrls.length));
    assert.ok(modelInput(q).leads.every(r => !blockedIds.includes(r.id)));
    // Sharing a Singtel product case-study source does not turn ETLA into that source's customer.
    assert.ok(q.items.some(r => r.id === 'O15'));
  }
  const comparison = s.comparison(); assert.equal(comparison.universe.length, 11);
  assert.ok(comparison.ablations.every(a => a.topFive.every(id => !blockedIds.includes(id))));
});

test('generated or cached extraction proposals are filtered again against the current customer register', () => {
  const source = readSources().find(s => s.id === 'S05')!;
  const raw = { facts: ['Source facts retained'], opportunities: [
    { account: 'Micron Singapore' }, { account: 'Singapore Customs' }, { account: 'AEIM Pte Ltd' },
  ] };
  assert.equal(filterCustomerProposals(raw, source, empty()).opportunities.length, 3);
  const filtered = filterCustomerProposals(raw, source, fixture);
  assert.deepEqual(filtered.opportunities.map(p => p.account), ['AEIM Pte Ltd']);
  assert.deepEqual(filtered.facts, raw.facts); assert.equal(filtered.customerEligibility.excluded.length, 2);
  const linked = { ...source, matchedEntityId: 'ACC-2' };
  assert.deepEqual(filterCustomerProposals({ opportunities: [{ account: 'Unresolved factory alias' }] }, linked, fixture).opportunities, []);
});

test('new public discovery and reset apply the same policy; raw rejected opportunities remain auditable', async () => {
  const db = empty(); db.customers.push({ ...fixture.customers[0], id: 'TEST-FRENCKEN', name: 'Frencken Group',
    accountIds: [], aliases: [], groupNames: ['Frencken Group'], basis: 'synthetic_crm',
    sourceUrl: 'https://example.test/mock-salesforce/frencken', evidence: 'Test-only synthetic existing customer.' });
  const s = new RankingService(null, makeSeed, () => db);
  await s.apply(replayEvents[0]); assert.ok(s.inspect().opportunities.some(o => o.id === 'O01'));
  assert.ok(!s.get().items.some(o => o.accountId === 'ACC-1'));
  assert.ok(s.get().customerEligibility!.excluded.some(e => e.opportunityId === 'O01'));
  await s.reset(); assert.ok(!s.get().items.some(o => o.accountId === 'ACC-1'));
});

test('editing the mock database invalidates persisted queues without restarting or resetting events', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'singtel-customer-'));
  const location = path.join(dir, 'customers.json'), statePath = path.join(dir, 'queue.json');
  try {
    fs.writeFileSync(location, JSON.stringify(empty()));
    const s = new RankingService(statePath, makeSeed, () => readCustomerDatabase(location));
    assert.equal(s.customerDatabase().customers.length, 0);
    await s.apply(replayEvents[0]); const oldVersion = s.get().queueVersion; assert.equal(s.get().total, 16);
    fs.writeFileSync(location, JSON.stringify(fixture));
    const q = s.get(); assert.equal(q.total, 12); assert.notEqual(q.queueVersion, oldVersion); assertEligible(q);
    assert.equal(s.customerDatabase().customers.length, fixture.customers.length);
    assert.equal(q.eventCursor, 1); assert.ok(q.items.some(o => o.id === 'O01'));
    const restored = new RankingService(statePath, makeSeed, () => readCustomerDatabase(location));
    assert.deepEqual(restored.get(), q);
    fs.writeFileSync(location, '{invalid');
    assert.throws(() => s.get(), e => e instanceof AppError && e.code === 'CUSTOMER_DATABASE_UNAVAILABLE');
    fs.unlinkSync(location); assert.throws(() => readCustomerDatabase(location));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('old successful AI output cannot resurrect customers after database changes, even when OpenAI fails', async () => {
  let db = empty(), fail = false; const s = new RankingService(null, makeSeed, () => db);
  const llm = new LlmQueueService(s, async q => { if (fail) throw new Error('Simulated provider failure'); return fakeAssessment(q); }, null);
  assert.equal((await llm.get('crm_plus_public', credential)).total, 15);
  db = clone(fixture); fail = true;
  for (const view of ['crm_plus_public', 'crm_only', 'deal_value'] as const) {
    const q = await llm.get(view, credential); assertEligible(q);
    assert.ok(q.items.every(r => !blockedIds.includes(r.id))); assert.equal(q.total, 11);
  }
  assert.equal((await llm.get('crm_plus_public', credential)).llm?.status, 'stale');
});

test('a database change during an AI call discards the obsolete result and filters its fallback', async () => {
  let db = empty(); const s = new RankingService(null, makeSeed, () => db);
  const llm = new LlmQueueService(s, async q => { db = clone(fixture); return fakeAssessment(q); }, null);
  const q = await llm.get('crm_plus_public', credential);
  assert.equal(q.llm?.code, 'ASSESSMENT_OUTDATED'); assertEligible(q); assert.equal(q.total, 11);
});

test('all candidates becoming customers returns an empty queue without a model call', async () => {
  const db = empty(); db.customers = makeSeed().opportunities.map(o => ({ ...fixture.customers[0],
    id: `TEST-${o.id}`, accountIds: [o.accountId], name: o.account, aliases: [], groupNames: [], basis: 'synthetic_crm' }));
  const s = new RankingService(null, makeSeed, () => db); let calls = 0;
  const llm = new LlmQueueService(s, async q => { calls++; return fakeAssessment(q); }, null);
  assert.deepEqual((await llm.get('crm_plus_public', credential)).items, []); assert.equal(calls, 0);
});

test('HTTP decision endpoints hide excluded customers and customer-register failures fail closed', async () => {
  let fail = false; const s = new RankingService(null, makeSeed, () => {
    if (fail) throw new AppError('Customer eligibility unavailable', 503, 'CUSTOMER_DATABASE_UNAVAILABLE'); return fixture;
  });
  const server = createDemoApp(s, { mode: 'rules' }).listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/ranking`;
  try {
    const q = await (await fetch(`${root}/queue`)).json() as QueueSnapshot; assertEligible(q);
    assert.equal((await fetch(`${root}/opportunities/O02/decision`)).status, 404);
    const register = await (await fetch(`${root}/customers`)).json() as any; assert.equal(register.isMock, true);
    fail = true; const response = await fetch(`${root}/queue`);
    assert.equal(response.status, 503); assert.equal((await response.json() as any).code, 'CUSTOMER_DATABASE_UNAVAILABLE');
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
