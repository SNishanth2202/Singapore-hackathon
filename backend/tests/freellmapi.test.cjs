const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFreeLlmClient } = require('../dist/integrations/freellmapi/client');
const { parseAnalysis } = require('../dist/integrations/freellmapi/analyze');

const config = { baseUrl: 'http://router.invalid/v1/', apiKey: 'test-only-secret', model: 'auto', timeoutMs: 100 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('lists models with backend-only credentials and normalized URL', async () => {
  const client = createFreeLlmClient(config, async (url, options) => {
    assert.equal(url, 'http://router.invalid/v1/models');
    assert.equal(options.headers.Authorization, 'Bearer test-only-secret');
    assert.equal(options.redirect, 'error');
    return json({ data: [{ id: 'model-a' }] });
  });
  assert.deepEqual(await client.listModels(), ['model-a']);
});

test('uses configured model and validates actual completion text', async () => {
  const client = createFreeLlmClient(config, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'auto');
    assert.equal(body.max_tokens, 16);
    assert.equal(body.stream, false);
    return json({ model: 'served-model', choices: [{ message: { content: 'OK' } }] });
  });
  assert.deepEqual(await client.generateText([{ role: 'user', content: 'Test' }], 16), {
    model: 'served-model', reply: 'OK', totalTokens: undefined,
  });
});

test('missing key stops before a network request', async () => {
  const client = createFreeLlmClient({ ...config, apiKey: '' }, async () => { throw new Error('should not call'); });
  await assert.rejects(client.listModels(), { code: 'AI_NOT_CONFIGURED' });
});

test('rejects malformed success payloads', async () => {
  const client = createFreeLlmClient(config, async () => json({ choices: [] }));
  await assert.rejects(client.generateText([{ role: 'user', content: 'Test' }]), { code: 'AI_INVALID_RESPONSE' });
});

test('upstream authentication and rate-limit errors never leak upstream bodies', async () => {
  for (const [status, code] of [[401, 'AI_AUTHENTICATION_FAILED'], [429, 'AI_RATE_LIMITED'], [500, 'AI_UPSTREAM_ERROR']]) {
    const client = createFreeLlmClient(config, async () => json({ error: config.apiKey }, status));
    await assert.rejects(client.listModels(), (error) => error.code === code && !error.message.includes(config.apiKey));
  }
});

test('aborts timed-out requests with a safe error', async () => {
  const client = createFreeLlmClient({ ...config, timeoutMs: 5 }, async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  await assert.rejects(client.listModels(), { code: 'AI_TIMEOUT' });
});

test('connection failures do not expose internal URLs or keys', async () => {
  const client = createFreeLlmClient(config, async () => { throw new Error(config.apiKey); });
  await assert.rejects(client.listModels(), (error) => error.code === 'AI_UNAVAILABLE' && !error.message.includes(config.apiKey));
});

test('empty text is not reported as a successful generation', async () => {
  const client = createFreeLlmClient(config, async () => json({ model: 'model-a', choices: [{ message: { content: null } }] }));
  await assert.rejects(client.generateText([{ role: 'user', content: 'Test' }]), { code: 'AI_EMPTY_RESPONSE' });
});

const brief = {
  summary: 'Fictional expansion scenario.', observedFacts: [{ text: 'A new warehouse is planned.', evidenceIds: ['ev-1'] }],
  possibleNeeds: [{ offeringId: 'international-connectivity', need: 'Connectivity', reason: 'A possible requirement to validate.' }],
  recommendedCapability: { offeringId: 'international-connectivity', name: 'International connectivity', reason: 'Possible fit.' },
  nextAction: { role: 'IT lead', question: 'How will the site connect?', whyNow: 'Validate the planned expansion.' },
  unknowns: ['Budget unknown'], readiness: 'NEEDS_RESEARCH',
};
test('analysis accepts structured fenced JSON with in-scope citations', () => {
  assert.equal(parseAnalysis('```json\n' + JSON.stringify(brief) + '\n```', new Set(['ev-1'])).readiness, 'NEEDS_RESEARCH');
});
test('analysis rejects invented evidence IDs', () => {
  assert.throws(() => parseAnalysis(JSON.stringify(brief), new Set(['other-company'])), { code: 'AI_UNSUPPORTED_EVIDENCE' });
});
test('analysis rejects invalid JSON instead of displaying a fake fallback', () => {
  assert.throws(() => parseAnalysis('Not a JSON response', new Set()), { code: 'AI_INVALID_ANALYSIS' });
});
test('a case without signals cannot produce a service recommendation', () => {
  const noFacts = { ...brief, observedFacts: [] };
  const result = parseAnalysis(JSON.stringify(noFacts), new Set());
  assert.equal(result.readiness, 'HOLD');
  assert.equal(result.recommendedCapability, null);
  assert.deepEqual(result.possibleNeeds, []);
});
