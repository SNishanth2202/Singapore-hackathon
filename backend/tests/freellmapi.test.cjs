const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFreeLlmClient } = require('../dist/integrations/freellmapi/client');
const { parseAnalysis, parseResearchAnalysis } = require('../dist/integrations/freellmapi/analyze');
const { createEvidenceReferences } = require('../dist/integrations/freellmapi/citations');

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

test('snapshot references resolve only exact source IDs, short aliases and current grouped events', () => {
  const refs = createEvidenceReferences(['src_a', 'src_b'], [{ id: 'event_current', sourceIds: ['src_a', 'src_b'] }]);
  assert.deepEqual(refs.resolve(['E1', 'src_b', 'event_current']), ['src_a', 'src_b']);
  for (const id of ['event_foreign', 'singtel-about', 'src_A', 'E99', '1', ' E1 ']) assert.equal(refs.resolve([id]), null);
  assert.equal(refs.resolve(['src_a', 'src_typo']), null);
  assert.deepEqual(JSON.parse(refs.forPrompt({ evidenceIds: ['src_a'], sellerSource: 'singtel-about' })),
    { evidenceIds: ['E1'], sellerSource: 'singtel-about' });
  const other = createEvidenceReferences(['src_other']);
  assert.equal(other.resolve(['event_current']), null);
});

test('source IDs resembling aliases and events with unapproved sources cannot hijack references', () => {
  const refs = createEvidenceReferences(['src_a', 'E1'], [{ id: 'event_bad', sourceIds: ['src_a', 'foreign'] }]);
  assert.deepEqual(refs.resolve(['E1']), ['E1']);
  assert.deepEqual(refs.resolve(['E2']), ['src_a']);
  assert.equal(refs.resolve(['event_bad']), null);
});

test('public observations come from server sources even when unused model observations have bad citations', () => {
  const refs = createEvidenceReferences(['ev-1']);
  const input = { ...brief, observedFacts: [{ text: 'An unsupported model claim.', evidenceIds: ['foreign'] }],
    possibleNeeds: [{ ...brief.possibleNeeds[0], evidenceIds: ['E1'] }],
    recommendedCapability: { ...brief.recommendedCapability, evidenceIds: ['E1'] } };
  const result = parseResearchAnalysis(JSON.stringify(input), refs);
  assert.deepEqual(result.analysis.observedFacts, []);
  assert.deepEqual(result.analysis.possibleNeeds[0].evidenceIds, ['ev-1']);
  assert.deepEqual(result.analysis.recommendedCapability.evidenceIds, ['ev-1']);
  assert.equal(result.rejections.length, 0);
});

test('one unknown citation withholds its entire suggestion while retaining independently supported suggestions', () => {
  const refs = createEvidenceReferences(['ev-1']);
  const supported = { ...brief.possibleNeeds[0], evidenceIds: ['E1'] };
  const result = parseResearchAnalysis(JSON.stringify({ ...brief,
    possibleNeeds: [supported, { ...supported, evidenceIds: ['E1', 'foreign'] }],
    recommendedCapability: { ...brief.recommendedCapability, evidenceIds: ['singtel-about'] },
    nextAction: { role: 'Invented', question: 'Act on the unsupported claim?', whyNow: 'Unsupported' },
  }), refs);
  assert.equal(result.analysis.possibleNeeds.length, 1);
  assert.deepEqual(result.analysis.possibleNeeds[0].evidenceIds, ['ev-1']);
  assert.equal(result.analysis.recommendedCapability, null);
  assert.equal(result.rejections.length, 2);
  assert.ok(result.rejections.every(r => r.code === 'UNRECOGNIZED_CITATION'));
  assert.doesNotMatch(result.analysis.nextAction.question, /unsupported claim/);
  assert.ok(result.validationWarnings.length);
});

test('current event references resolve to their exact source group and unknown services remain withheld', () => {
  const refs = createEvidenceReferences(['ev-1', 'ev-2'], [{ id: 'event_current', sourceIds: ['ev-1', 'ev-2'] }]);
  const input = { ...brief, possibleNeeds: [{ ...brief.possibleNeeds[0], evidenceIds: ['event_current'] }], recommendedCapability: null };
  assert.deepEqual(parseResearchAnalysis(JSON.stringify(input), refs).analysis.possibleNeeds[0].evidenceIds, ['ev-1', 'ev-2']);
  input.possibleNeeds[0].offeringId = 'invented-service';
  const rejected = parseResearchAnalysis(JSON.stringify(input), refs);
  assert.deepEqual(rejected.analysis.possibleNeeds, []);
  assert.equal(rejected.rejections[0].code, 'UNSUPPORTED_OFFERING');
  assert.throws(() => parseResearchAnalysis('invalid JSON', refs), { code: 'AI_INVALID_ANALYSIS' });
});

test('account analysis resolves short references but still rejects unknown citations', async t => {
  const { analyzeCompany } = require('../dist/integrations/freellmapi/analyze');
  const { env } = require('../dist/config/env');
  const { businessKnowledgeStore, getSeedKnowledge } = require('../dist/business/store');
  const repository = require('../dist/repositories/companyRepository');
  const client = require('../dist/integrations/freellmapi/client').freeLlmClient;
  const original = { demo: env.LOCAL_DEMO_MODE, read: businessKnowledgeStore.read, find: repository.findCompanyWithSignals, generate: client.generateText };
  t.after(() => { env.LOCAL_DEMO_MODE = original.demo; businessKnowledgeStore.read = original.read;
    repository.findCompanyWithSignals = original.find; client.generateText = original.generate; });
  env.LOCAL_DEMO_MODE = false;
  businessKnowledgeStore.read = async () => getSeedKnowledge();
  repository.findCompanyWithSignals = async () => ({ company: { companyName: 'Example Logistics' }, signals: [
    { _id: 'account-source-1', signalType: 'EXPANSION', description: 'Example Logistics opens a new Singapore warehouse', publishedAt: new Date().toISOString() },
  ] });
  let citation = 'E1';
  client.generateText = async messages => {
    const data = JSON.parse(messages[1].content.split('COMPANY DATA:\n')[1]);
    assert.equal(data.signals[0]._id, 'E1');
    return { model: 'test-model', reply: JSON.stringify({ ...brief,
      observedFacts: [{ text: 'Reported warehouse expansion.', evidenceIds: [citation] }],
      possibleNeeds: [{ ...brief.possibleNeeds[0], evidenceIds: [citation] }],
      recommendedCapability: { ...brief.recommendedCapability, evidenceIds: [citation] },
    }) };
  };
  const result = await analyzeCompany('account-test');
  assert.deepEqual(result.analysis.observedFacts[0].evidenceIds, ['account-source-1']);
  assert.equal(result.analysis.possibleNeeds.length, 1);
  citation = 'foreign-source';
  await assert.rejects(analyzeCompany('account-test'), { code: 'AI_UNSUPPORTED_EVIDENCE' });
});
