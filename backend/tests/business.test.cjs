const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { KnowledgeSchema } = require('../dist/business/schema');
const { getSeedKnowledge, createKnowledgeStore, businessKnowledgeStore } = require('../dist/business/store');
const { identifySeller, matchOfferings } = require('../dist/business/matching');
const { buildBusinessContext } = require('../dist/business/prompt');
const { groundAnalysis } = require('../dist/integrations/research/grounding');
const { parseAnalysis, analyzeCompany } = require('../dist/integrations/freellmapi/analyze');

const evidence = (text, options = {}) => ({ id: 'ev-1', title: text, text: 'A public headline, requiring verification.', kind: 'public', publishedAt: new Date().toISOString(), ...options });
const analysis = (id = 'international-connectivity') => ({
  summary: 'A reported business development requires verification.', observedFacts: [],
  possibleNeeds: [{ offeringId: id, need: 'Possible service requirement', reason: 'Confirm the requirement with the customer.', evidenceIds: ['ev-1'] }],
  recommendedCapability: { offeringId: id, name: 'Untrusted model name', reason: 'A potential fit for discovery.', evidenceIds: ['ev-1'] },
  nextAction: { role: 'IT lead', question: 'What need is confirmed?', whyNow: 'Verify the report.' }, unknowns: [], readiness: 'NEEDS_RESEARCH',
});

test('seed catalogue is linked, structured and separates team strategy from seller facts', () => {
  const knowledge = getSeedKnowledge();
  assert.equal(knowledge.offerings.length, 14);
  assert.equal(knowledge.strategy.provenance, 'team_configured_hypotheses');
  for (const offering of knowledge.offerings) {
    assert.ok(offering.sourceIds.every(id => knowledge.sources.some(s => s.id === id)));
    assert.equal(offering.availability.verificationRequired, true);
  }
});

test('seller identity uses configured IDs, domains and exact canonical names', () => {
  const k = getSeedKnowledge();
  for (const company of [{ name: 'Singtel' }, { name: 'Singapore Telecommunications Limited' }, { name: 'Other label', entityId: 'Q864923' }, { name: 'Other label', website: 'https://business.singtel.com/' }]) assert.equal(identifySeller(company, k).isSeller, true);
  for (const company of [{ name: 'Singtel Partner Logistics' }, { name: 'Other Telecom' }, { name: 'Other Company', aliases: ['Singtel'] }, { name: 'Other Company', website: 'https://singtel.com.example.org/' }]) assert.equal(identifySeller(company, k).isSeller, false);
  k.seller = { ...k.seller, name: 'New Seller', legalName: 'New Seller Ltd', aliases: [], domains: ['new-seller.example'], entityIds: [] };
  assert.equal(identifySeller({ name: 'Singtel' }, k).isSeller, false);
  assert.equal(identifySeller({ name: 'New Seller Limited' }, k).isSeller, true);
});

test('generic country mentions and local expansion do not establish international connectivity fit', () => {
  const k = getSeedKnowledge();
  for (const text of ['Example wins an award in India', 'Example expands a warehouse']) {
    assert.ok(!matchOfferings(k, [evidence(text)]).some(m => m.offeringId === 'international-connectivity'));
  }
  assert.ok(matchOfferings(k, [evidence('Example opens a new Singapore warehouse')]).some(m => m.offeringId === 'international-connectivity'));
});

test('background, undated, old, future and legally unrelated material cannot trigger services', () => {
  const k = getSeedKnowledge();
  for (const e of [evidence('Example cybersecurity', { kind: 'profile' }), evidence('Example cybersecurity', { publishedAt: null }), evidence('Example cybersecurity', { publishedAt: 'invalid' }), evidence('Example cybersecurity', { publishedAt: '2001-01-01T00:00:00Z' }), evidence('Example cybersecurity', { publishedAt: new Date(Date.now() + 5*86400000).toISOString() }), evidence('Example lawsuit mentions cybersecurity')]) assert.deepEqual(matchOfferings(k, [e]), []);
});

test('new offerings, exclusions and recency policy work through configuration alone', () => {
  const k = getSeedKnowledge();
  const added = { ...structuredClone(k.offerings[0]), id: 'test-service', name: 'Test service', aliases: [], signalRules: { anyTerms: ['special requirement'], requiredAnyTerms: [], excludeTerms: ['cancelled'] } };
  k.offerings.push(added);
  const valid = KnowledgeSchema.parse(k);
  assert.ok(matchOfferings(valid, [evidence('Example announces a special requirement')]).some(m => m.offeringId === 'test-service'));
  assert.ok(!matchOfferings(valid, [evidence('Example special requirement cancelled')]).some(m => m.offeringId === 'test-service'));
  valid.offerings.find(o => o.id === 'test-service').active = false;
  assert.ok(!matchOfferings(valid, [evidence('Example special requirement')]).some(m => m.offeringId === 'test-service'));
  valid.evidencePolicy.maxSignalAgeDays = 1;
  assert.deepEqual(matchOfferings(valid, [evidence('Example cybersecurity', { publishedAt: new Date(Date.now() - 3*86400000).toISOString() })]), []);
});

test('model output cannot create unknown or inactive seller offerings, and names resolve server-side', () => {
  const k = getSeedKnowledge();
  assert.throws(() => parseAnalysis(JSON.stringify(analysis('invented-service')), new Set(['ev-1']), k), { code: 'AI_UNSUPPORTED_OFFERING' });
  const parsed = parseAnalysis(JSON.stringify(analysis()), new Set(['ev-1']), k);
  assert.equal(parsed.recommendedCapability.name, 'International connectivity');
  k.offerings.find(o => o.id === 'international-connectivity').active = false;
  assert.throws(() => parseAnalysis(JSON.stringify(analysis()), new Set(['ev-1']), k), { code: 'AI_UNSUPPORTED_OFFERING' });
});

test('grounding requires evidence for the actual offering and need, not any available source', () => {
  const k = getSeedKnowledge();
  const sources = [evidence('Example opens a Singapore warehouse'), evidence('Example reports ransomware incident', { id: 'ev-2' })];
  const cyber = analysis('cybersecurity');
  assert.equal(groundAnalysis(cyber, sources, k).analysis.recommendedCapability, null);
  cyber.possibleNeeds[0].evidenceIds = ['ev-2']; cyber.recommendedCapability.evidenceIds = ['ev-2'];
  assert.ok(groundAnalysis(cyber, sources, k).analysis.recommendedCapability);
  const mismatch = analysis(); mismatch.possibleNeeds[0].offeringId = 'cybersecurity'; mismatch.possibleNeeds[0].evidenceIds = ['ev-2'];
  assert.equal(groundAnalysis(mismatch, sources, k).analysis.recommendedCapability, null);
});

test('prompt context uses the current seller, objectives, roles, candidates and source references', () => {
  const k = getSeedKnowledge(); k.version = 12; k.strategy.priorityMarkets = ['Test market'];
  const context = buildBusinessContext(k, matchOfferings(k, [evidence('Example opens a Singapore warehouse')]));
  assert.equal(context.knowledgeVersion, 12);
  assert.deepEqual(context.strategy.priorityMarkets, ['Test market']);
  assert.ok(context.catalogue.find(o => o.id === 'international-connectivity').discoveryQuestions.length);
  assert.equal(context.constraints.candidateMatchesProveDemand, false);
  assert.ok(!JSON.stringify(context).includes('FREELLMAPI_API_KEY'));
});

test('configuration rejects duplicate IDs, missing references, unknown keys and malformed URLs', () => {
  for (const change of [k => k.offerings.push(k.offerings[0]), k => k.offerings[0].sourceIds.push('missing-source'), k => k.offerings[0].targetSegmentIds.push('missing-segment'), k => k.apiKey = 'must-not-be-here', k => k.sources[0].url = 'http://example.com', k => k.evidencePolicy.maxSignalAgeDays = 0]) {
    const k = getSeedKnowledge(); change(k); assert.equal(KnowledgeSchema.safeParse(k).success, false);
  }
});

test('configuration persists across store instances, versions edits and rejects stale saves', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'singtel-knowledge-test-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createKnowledgeStore(directory);
  const first = await store.read(); first.strategy.priorityMarkets = ['Test market'];
  const next = await store.update(1, first);
  assert.equal(next.version, 2);
  const reopened = await createKnowledgeStore(directory).read();
  assert.deepEqual(reopened.strategy.priorityMarkets, ['Test market']);
  await assert.rejects(store.update(1, first), { code: 'KNOWLEDGE_CONFLICT' });
  const invalid = structuredClone(next); invalid.offerings[0].sourceIds = ['missing-source'];
  await assert.rejects(store.update(2, invalid));
  assert.equal((await store.read()).version, 2);
  assert.equal((await fs.readdir(path.join(directory, 'versions'))).length, 2);
  await fs.writeFile(path.join(directory, 'current.json'), '{broken');
  await assert.rejects(store.read(), { code: 'KNOWLEDGE_UNAVAILABLE' });
});

test('self-company analysis holds before calling the AI and identifies the knowledge version', async t => {
  const research = require('../dist/integrations/research/store');
  const client = require('../dist/integrations/freellmapi/client').freeLlmClient;
  const original = { read: businessKnowledgeStore.read, load: research.loadResearch, generate: client.generateText };
  t.after(() => { businessKnowledgeStore.read = original.read; research.loadResearch = original.load; client.generateText = original.generate; });
  businessKnowledgeStore.read = async () => getSeedKnowledge();
  research.loadResearch = async () => ({ company: { name: 'Singtel', entityId: 'Q864923' }, sources: [], warnings: [] });
  client.generateText = async () => { throw new Error('AI must not run for seller identity'); };
  const result = await analyzeCompany('research-test');
  assert.equal(result.analysis.readiness, 'HOLD');
  assert.equal(result.analysis.recommendedCapability, null);
  assert.equal(result.analysisOrigin, 'seller_check');
  assert.equal(result.model, null);
  assert.equal(result.businessContext.companyClassification, 'SELLER');
  assert.equal(result.businessContext.knowledgeVersion, 1);
});
