import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AddressInfo } from 'net';
import { RankingService } from '../src/ranking/service';
import { LlmQueueService } from '../src/ranking/llm-queue';
import { RankingKeySessions, sharedRankingCredential } from '../src/ranking/key-sessions';
import { createDemoApp } from '../src/ranking/demo-server';
import { QueueSnapshot, clone } from '../src/ranking/contracts';
import { replayEvents } from '../src/ranking/seed';
import { AppError } from '../src/utils/errors';
import { assessWithOpenAi, LeadAssessment, modelInput, OpenAiCredential, openAiRequest, validateAssessments } from '../src/ranking/openai-ranking';

const credential: OpenAiCredential = { apiKey: 'sk-test-placeholder-not-a-real-key', model: 'test-model', namespace: 'test-a', source: 'session' };
function assessments(q: QueueSnapshot): LeadAssessment[] {
  return q.items.map(r => ({ id: r.id, score: r.id === 'O15' ? 100 : 12,
    priorityStatus: 'Urgent', confidence: r.unbounded ? null : 73,
    reason: 'The supplied buying window supports a timely verification conversation.',
    confidenceReason: 'The synthetic CRM and supplied source evidence support this assessment.',
    urgencyReasons: ['Short purchasing window', 'High ticket contract'], confidenceReasons: ['Synthetic CRM evidence'],
    evidenceIds: [r.evidence[0].id], verifyNext: 'Confirm the required site assessment.' }));
}
const result = (q: QueueSnapshot) => ({ rows: assessments(q), model: 'test-model-served', responseId: 'resp-test' });

const routerEnvironment = { AI_BASE_URL: 'https://openrouter.ai/api/v1', AI_API_KEY: 'sk-or-v1-test-placeholder-not-real',
  AI_MODEL: 'example/free-model', AI_PROTOCOL: 'chat_completions', AI_REASONING_EFFORT: 'none' };
const catalogReply = (parameters: string[] = []) => new Response(JSON.stringify({ data: [{ id: routerEnvironment.AI_MODEL, supported_parameters: parameters }] }));

test('ranking reuses the shared provider namespace and does not borrow a different provider key', () => {
  const keys = new RankingKeySessions(async () => undefined, { ...routerEnvironment, OPENAI_API_KEY: 'sk-other-provider-placeholder' });
  const req = { headers: {} } as any;
  const resolved = keys.resolve(req)!;
  assert.equal(resolved.apiKey, routerEnvironment.AI_API_KEY);
  assert.equal(resolved.model, routerEnvironment.AI_MODEL);
  assert.equal(resolved.provider, 'OpenRouter');
  assert.equal(resolved.providerConfig?.baseUrl, routerEnvironment.AI_BASE_URL);
  assert.equal(resolved.providerConfig?.reasoningEffort, 'none');
  assert.equal(keys.status(req).configured, true);
  assert.equal(keys.status(req).provider, 'OpenRouter');
  assert.ok(!JSON.stringify(keys.status(req)).includes(resolved.apiKey));
  assert.equal(new RankingKeySessions(async () => undefined, { ...routerEnvironment, AI_API_KEY: '', OPENAI_API_KEY: 'sk-other-provider-placeholder' }).resolve(req), null);
  assert.equal(sharedRankingCredential({ ...routerEnvironment, AI_BASE_URL: 'http://127.0.0.1:31415/v1' }), null);
  assert.notEqual(sharedRankingCredential({ ...routerEnvironment, AI_MODEL: 'other-model' })!.namespace, resolved.namespace);
  assert.notEqual(sharedRankingCredential({ ...routerEnvironment, AI_PROTOCOL: 'responses' })!.namespace, resolved.namespace);
});

test('shared Chat Completions assessment uses the existing key, model and strict evidence validation', async () => {
  const q = new RankingService(null).get(), configured = sharedRankingCredential(routerEnvironment)!;
  let calls = 0;
  const transport = (async (url: string, options: RequestInit) => {
    if (url.endsWith('/models')) return catalogReply();
    calls++;
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal((options.headers as any).Authorization, `Bearer ${routerEnvironment.AI_API_KEY}`);
    const body = JSON.parse(options.body as string);
    assert.equal(body.model, routerEnvironment.AI_MODEL);
    assert.equal(body.reasoning.effort, 'none');
    assert.ok(body.max_tokens > 4096);
    assert.equal(body.response_format, undefined);
    assert.match(body.messages[0].content, /Required JSON schema/);
    return new Response(JSON.stringify({ id: 'router-generation-id', model: 'served-router-model', usage: { total_tokens: 321 },
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ leads: assessments(q) }) } }] }));
  }) as typeof fetch;
  const response = await assessWithOpenAi(q, configured, transport);
  assert.equal(calls, 1); assert.equal(response.rows.length, 11);
  assert.equal(response.responseId, 'router-generation-id'); assert.equal(response.model, 'served-router-model');
  assert.equal(response.totalTokens, 321);
  const bad = assessments(q); bad[0].evidenceIds = ['another-lead-or-invented-evidence'];
  const reply = (content: unknown, reason = 'stop') => (async () => new Response(JSON.stringify({ model: 'served-router-model', choices: [{ finish_reason: reason, message: { content: JSON.stringify(content) } }] }))) as typeof fetch;
  await assert.rejects(assessWithOpenAi(q, configured, reply({ leads: bad })), { code: 'AI_INVALID_ASSESSMENT' });
  await assert.rejects(assessWithOpenAi(q, configured, reply({ leads: assessments(q) }, 'length')), { code: 'AI_INCOMPLETE_RESPONSE' });
});

test('shared Responses configuration is honored and provider errors never expose credentials or upstream text', async () => {
  const q = new RankingService(null).get(), configured = sharedRankingCredential({ ...routerEnvironment, AI_PROTOCOL: 'responses' })!;
  const transport = (async (url: string, options: RequestInit) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/responses');
    const body = JSON.parse(options.body as string); assert.equal(body.store, false); assert.ok(Array.isArray(body.input));
    return new Response(JSON.stringify({ id: 'router-response-id', model: 'served-router-model', status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ leads: assessments(q) }) }] }] }));
  }) as typeof fetch;
  assert.equal((await assessWithOpenAi(q, configured, transport)).responseId, 'router-response-id');
  const rejected = (async () => new Response(JSON.stringify({ error: { message: routerEnvironment.AI_API_KEY } }), { status: 401 })) as typeof fetch;
  await assert.rejects(assessWithOpenAi(q, configured, rejected), e => e instanceof AppError && e.code === 'AI_AUTHENTICATION_FAILED' && !e.message.includes(routerEnvironment.AI_API_KEY));
});

test('router output gets one validation-guided correction and still rejects unsupported evidence', async () => {
  const q = new RankingService(null).get(), configured = sharedRankingCredential(routerEnvironment)!;
  let calls = 0;
  const transport = (async (url: string, options: RequestInit) => {
    if (url.endsWith('/models')) return catalogReply();
    calls++;
    const body = JSON.parse(options.body as string);
    if (calls === 2) {
      assert.equal(body.messages[2].role, 'assistant');
      assert.match(body.messages[3].content, /Validation rejected/);
      assert.match(body.messages[3].content, /unrecognized_keys/);
      assert.deepEqual(JSON.parse(body.messages[1].content), modelInput(q));
    }
    return new Response(JSON.stringify({ id: `correction-${calls}`, model: 'served-router-model',
      usage: { total_tokens: 100 }, choices: [{ finish_reason: 'stop', message: {
        content: JSON.stringify({ leads: assessments(q), ...(calls === 1 ? { type: 'object' } : {}) }),
      } }] }));
  }) as typeof fetch;
  const result = await assessWithOpenAi(q, configured, transport);
  assert.equal(calls, 2); assert.equal(result.responseId, 'correction-2'); assert.equal(result.totalTokens, 200);
  const bad = assessments(q); bad[0].evidenceIds = ['fabricated-evidence']; calls = 0;
  const invalid = (async (url: string) => { if (url.endsWith('/models')) return catalogReply(); calls++; return new Response(JSON.stringify({ model: 'served-router-model', choices: [{
    finish_reason: 'stop', message: { content: JSON.stringify({ leads: bad }) },
  }] })); }) as typeof fetch;
  await assert.rejects(assessWithOpenAi(q, configured, invalid), { code: 'AI_INVALID_ASSESSMENT' });
  assert.equal(calls, 2);
  calls = 0;
  const limited = (async (url: string) => { if (url.endsWith('/models')) return catalogReply(); calls++; return new Response('{}', { status: 429 }); }) as typeof fetch;
  await assert.rejects(assessWithOpenAi(q, configured, limited), { code: 'AI_RATE_LIMITED' });
  assert.equal(calls, 1);
});

test('advertised router tool output is parsed as data and never executes unexpected tools', async () => {
  const q = new RankingService(null).get(), configured = sharedRankingCredential(routerEnvironment)!;
  let toolName = 'submit_lead_assessments', duplicate = false;
  const transport = (async (url: string, options: RequestInit) => {
    if (url.endsWith('/models')) return catalogReply(['tools', 'tool_choice']);
    const body = JSON.parse(options.body as string);
    assert.equal(body.tool_choice.function.name, 'submit_lead_assessments');
    assert.equal(body.tools.length, 1); assert.ok(body.tools[0].function.parameters.properties.leads);
    const call = { type: 'function', function: { name: toolName, arguments: JSON.stringify({ leads: assessments(q) }) } };
    return new Response(JSON.stringify({ id: 'structured-router-response', model: 'served-router-model', choices: [{
      finish_reason: 'tool_calls', message: { content: null, tool_calls: duplicate ? [call, call] : [call] },
    }] }));
  }) as typeof fetch;
  const result = await assessWithOpenAi(q, configured, transport);
  assert.equal(result.rows.length, 11); assert.equal(result.responseId, 'structured-router-response');
  toolName = 'unexpected_tool';
  await assert.rejects(assessWithOpenAi(q, configured, transport), { code: 'AI_INVALID_RESPONSE' });
  toolName = 'submit_lead_assessments'; duplicate = true;
  await assert.rejects(assessWithOpenAi(q, configured, transport), { code: 'AI_INVALID_RESPONSE' });
});

test('LLM input contains raw facts without deterministic scores and CRM-only excludes public evidence', () => {
  const rules = new RankingService(null), input = modelInput(rules.get());
  assert.equal(input.leads.length, 11);
  for (const row of input.leads) {
    assert.ok(row.gates.length); assert.ok(row.evidence.length);
    for (const key of ['score', 'priorityStatus', 'rankingConfidence', 'components']) assert.equal(key in row, false);
  }
  assert.ok(modelInput(rules.get('crm_only')).leads.every(r => r.evidence.every(e => e.origin !== 'public')));
});

test('structured assessment validation rejects missing, duplicate, invented or cross-lead claims and long descriptors', () => {
  const q = new RankingService(null).get(), leads = assessments(q);
  assert.equal(validateAssessments({ leads }, q).length, 11);
  assert.throws(() => validateAssessments({ leads: leads.slice(1) }, q));
  assert.throws(() => validateAssessments({ leads: [...leads.slice(1), leads[1]] }, q));
  const change = (patch: Partial<LeadAssessment>) => ({ leads: [{ ...leads[0], ...patch }, ...leads.slice(1)] });
  assert.throws(() => validateAssessments(change({ id: 'invented' }), q));
  assert.throws(() => validateAssessments(change({ evidenceIds: ['not-this-lead'] }), q));
  assert.throws(() => validateAssessments(change({ score: 101 }), q));
  assert.throws(() => validateAssessments(change({ confidence: -1 }), q));
  assert.throws(() => validateAssessments(change({ urgencyReasons: ['This descriptor has far too many words'] }), q));
  const unbounded = clone(q); unbounded.items[0].unbounded = true;
  assert.throws(() => validateAssessments({ leads }, unbounded));
  assert.doesNotThrow(() => validateAssessments(change({ confidence: null }), unbounded));
});

test('Responses request uses structured output, no storage and a fixed official endpoint; failures never echo secrets', async () => {
  const q = new RankingService(null).get(); let requested = false;
  const transport = (async (url: string, options: RequestInit) => {
    requested = true; assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body as string);
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.type, 'json_schema'); assert.equal(body.model, credential.model);
    assert.equal((options.headers as any).Authorization, `Bearer ${credential.apiKey}`);
    return new Response(JSON.stringify({ id: 'resp-test', model: 'test-model-served', status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ leads: assessments(q) }) }] }] }));
  }) as typeof fetch;
  assert.equal((await assessWithOpenAi(q, credential, transport)).model, 'test-model-served'); assert.ok(requested);
  const rejected = (async () => new Response(JSON.stringify({ error: { message: credential.apiKey } }), { status: 401 })) as typeof fetch;
  await assert.rejects(openAiRequest(credential.apiKey, '/models', undefined, rejected), e => e instanceof AppError && e.code === 'OPENAI_KEY_REJECTED' && !e.message.includes(credential.apiKey));
  const refused = (async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }))) as typeof fetch;
  await assert.rejects(assessWithOpenAi(q, credential, refused), /declined/);
  const incomplete = (async () => new Response(JSON.stringify({ status: 'incomplete', output: [] }))) as typeof fetch;
  await assert.rejects(assessWithOpenAi(q, credential, incomplete), /incomplete/);
});

test('model chooses urgency and confidence independently; fulfilment gates and deterministic tiebreak remain enforced', async () => {
  const rules = new RankingService(null), llm = new LlmQueueService(rules, async q => result(q), null);
  const q = await llm.get('crm_plus_public', credential);
  assert.equal(q.llm?.status, 'ready');
  for (const row of q.items) {
    const base = rules.get().items.find(r => r.id === row.id)!;
    assert.equal(row.priorityStatus, 'Urgent'); assert.equal(row.rankingConfidence.score, 73);
    assert.equal(row.status, base.status); assert.deepEqual(row.gates, base.gates);
    assert.equal(row.rankingConfidence.method, 'llm_assessment'); assert.deepEqual(row.rankingConfidence.scenarios, []);
    assert.equal(row.rankingConfidence.actionScore, null); assert.deepEqual(row.components, []);
  }
  assert.equal(q.items.at(-1)?.status, 'Monitor');
  // Private 5G's high model score cannot erase its mandatory Verify action.
  assert.equal(q.items.find(r => r.id === 'O15')?.status, 'Verify');
  const equal = q.items.filter(r => r.status !== 'Blocked' && r.status !== 'Monitor' && r.id !== 'O15');
  assert.deepEqual(equal.map(r => r.id), [...equal].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.id.localeCompare(b.id)).map(r => r.id));
});

test('unchanged requests, concurrent calls, duplicate events and source failure reuse the last successful model result', async () => {
  let calls = 0; const rules = new RankingService(null);
  const llm = new LlmQueueService(rules, async q => { calls++; await new Promise(r => setTimeout(r, 10)); return result(q); }, null);
  const [a, b] = await Promise.all([llm.get('crm_plus_public', credential), llm.get('crm_plus_public', credential)]);
  assert.equal(calls, 1); assert.deepEqual(a, b);
  await rules.advance(new Date(Date.parse(rules.get().asOf) + 1000).toISOString());
  await llm.get('crm_plus_public', credential); assert.equal(calls, 1);
  await rules.refresh(true); const failedSource = await llm.get('crm_plus_public', credential);
  assert.equal(calls, 1); assert.equal(failedSource.degraded, true); assert.deepEqual(failedSource.items, a.items);
  await rules.apply(replayEvents[0]); await llm.get('crm_plus_public', credential); assert.equal(calls, 2);
  await rules.apply(replayEvents[0]); await llm.get('crm_plus_public', credential); assert.equal(calls, 2);
  await llm.get('crm_plus_public', credential, true); assert.equal(calls, 3);
});

test('provider failure preserves previous assessment, stays stale on refresh, and missing key never impersonates AI', async () => {
  let fail = false; const rules = new RankingService(null);
  const llm = new LlmQueueService(rules, async q => { if (fail) throw new Error(credential.apiKey); return result(q); }, null);
  const good = await llm.get('crm_plus_public', credential); fail = true;
  const stale = await llm.get('crm_plus_public', credential, true);
  assert.deepEqual(stale.items, good.items); assert.equal(stale.llm?.status, 'stale');
  assert.equal((await llm.get('crm_plus_public', credential)).llm?.status, 'stale');
  assert.ok(!JSON.stringify(stale).includes(credential.apiKey));
  const missing = await llm.get('crm_plus_public', null);
  assert.equal(missing.llm?.status, 'needs_key'); assert.equal(missing.total, 11);
  assert.ok(missing.items.every(r => r.assessment?.pending && r.rankingConfidence.score === null));
  const neverSucceeded = await llm.get('crm_plus_public', { ...credential, namespace: 'new-session' });
  assert.equal(neverSucceeded.llm?.status, 'failed'); assert.ok(neverSucceeded.items.every(r => r.assessment?.pending));
});

test('a changed commercial estimate invalidates AI cache even inside an unchanged rules points bucket', async () => {
  const rules = new RankingService(null), originalGet = rules.get.bind(rules); let delta = 0, calls = 0;
  rules.get = view => { const q = originalGet(view); q.items[0].annualDealValueSgd += delta; return q; };
  const llm = new LlmQueueService(rules, async q => { calls++; return result(q); }, null);
  const first = await llm.get('crm_plus_public', credential); delta = 1;
  const changed = await llm.get('crm_plus_public', credential);
  assert.equal(calls, 2); assert.notEqual(first.llm?.inputHash, changed.llm?.inputHash);
});

test('empty queues never call the model, and evidence changing in flight rejects an obsolete result', async () => {
  const rules = new RankingService(null); await rules.reset(true); let calls = 0;
  const llm = new LlmQueueService(rules, async q => { calls++; return result(q); }, null);
  assert.deepEqual((await llm.get('crm_plus_public', credential)).items, []); assert.equal(calls, 0);
  await rules.reset();
  const racing = new LlmQueueService(rules, async q => { await rules.apply(replayEvents[0]); return result(q); }, null);
  const q = await racing.get('crm_plus_public', credential);
  assert.equal(q.llm?.code, 'ASSESSMENT_OUTDATED'); assert.notEqual(q.llm?.status, 'ready');
});

test('key namespaces isolate assessments; only environment-key results persist without a key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'singtel-llm-')), location = path.join(dir, 'cache.json');
  try {
    let calls = 0; const rules = new RankingService(null), scorer = async (q: QueueSnapshot) => { calls++; return result(q); };
    const llm = new LlmQueueService(rules, scorer, location);
    await llm.get('crm_plus_public', credential); assert.equal(fs.existsSync(location), false);
    await llm.get('crm_plus_public', { ...credential, namespace: 'test-b' }); assert.equal(calls, 2);
    const env = { ...credential, namespace: 'env-test', source: 'environment' as const };
    const q = await llm.get('crm_plus_public', env); assert.equal(calls, 3);
    assert.ok(!fs.readFileSync(location, 'utf8').includes(credential.apiKey));
    assert.deepEqual(await new LlmQueueService(rules, scorer, location).get('crm_plus_public', env), q); assert.equal(calls, 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('API key setup uses an opaque HttpOnly session, isolates browsers, and returns no raw key', async () => {
  const rules = new RankingService(null), keys = new RankingKeySessions(async () => undefined, {});
  const app = createDemoApp(rules, { mode: 'llm', keys, llm: new LlmQueueService(rules, async q => result(q), null) });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/ranking`;
  try {
    assert.equal((await (await fetch(`${root}/queue`)).json() as any).llm.code, 'OPENAI_KEY_REQUIRED');
    const response = await fetch(`${root}/llm/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: credential.apiKey }) });
    assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/); assert.ok(!cookie.includes(credential.apiKey));
    assert.ok(!(await response.text()).includes(credential.apiKey));
    const authenticated = await (await fetch(`${root}/queue`, { headers: { Cookie: cookie.split(';')[0] } })).json() as any;
    assert.equal(authenticated.llm.status, 'ready'); assert.ok(!JSON.stringify(authenticated).includes(credential.apiKey));
    assert.equal((await (await fetch(`${root}/llm/status`)).json() as any).configured, false);
    await fetch(`${root}/llm/session`, { method: 'DELETE', headers: { Cookie: cookie.split(';')[0] } });
    assert.equal((await (await fetch(`${root}/llm/status`, { headers: { Cookie: cookie.split(';')[0] } })).json() as any).configured, false);
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
