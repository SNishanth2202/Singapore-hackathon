const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildResearchOverview, classifySource } = require('../dist/integrations/research/events');
const { researchEvidence, groundAnalysis, factualResearchSummary } = require('../dist/integrations/research/grounding');
const { getSeedKnowledge, businessKnowledgeStore } = require('../dist/business/store');
const { KnowledgeSchema } = require('../dist/business/schema');
const { matchOfferings } = require('../dist/business/matching');
const { analyzeCompany } = require('../dist/integrations/freellmapi/analyze');

const company = { name: 'Deloitte', aliases: [], entityId: 'Q491748', description: 'professional services network' };
const source = (id, title, publisher = 'Example Publisher', extra = {}) => ({
  id, title, publisher, kind: 'news_headline', excerpt: `Headline only: ${title}`, publishedAt: new Date().toISOString(),
  retrievedAt: new Date().toISOString(), verification: 'headline_only', url: 'https://example.com/' + id, ...extra,
});
function record() {
  return { company, sources: [
    source('identity', 'Deloitte - identity listing', 'Wikidata', { kind: 'company_profile', publishedAt: null }),
    source('macro', 'AI investments keep US economic growth in gear, for now - Deloitte', 'Deloitte'),
    source('acq-1', "Deloitte Announces Acquisition Of Flipside Crypto's AI Business And Launches Edisyl - TradingView", 'TradingView'),
    source('partner', 'From Funding to Fielded Capability: How AWS and Deloitte Partner on National Security Outcomes - CDO Magazine', 'CDO Magazine'),
    source('acq-2', "Deloitte launches Edisyl after acquiring Flipside Crypto’s AI business - Crypto Briefing", 'Crypto Briefing'),
    source('acq-3', "Deloitte Announces Acquisition of Flipside Crypto's AI Business and Launches Edisyl to Help Close the Context Gap in Enterprise AI - PR Newswire", 'PR Newswire'),
  ], warnings: [] };
}
function brief(id, citations) {
  return { summary: 'Deloitte is investing in the US economy.', observedFacts: [],
    possibleNeeds: [{ offeringId: id, need: 'Explore AI workload integration', reason: 'The reported acquisition may create integration questions; no infrastructure gap is confirmed.', evidenceIds: citations }],
    recommendedCapability: { offeringId: id, name: 'AI infrastructure and security', reason: 'Assess whether the AI integration creates an unmet infrastructure requirement.', evidenceIds: citations },
    nextAction: { role: 'AI lead', question: 'Does integrating the acquired AI business change workloads or incumbent-provider coverage?', whyNow: 'Validate the report.' },
    unknowns: ['Existing infrastructure and providers', 'Current cybersecurity concerns'], readiness: 'HOLD' };
}

test('publisher bylines and macroeconomic commentary are not company investment events', () => {
  const r = record();
  assert.equal(classifySource(r.sources[1], company).relevance, 'COMMENTARY');
  assert.equal(classifySource(source('quote', 'Deloitte says AI will drive industry growth - Example Publisher'), company).relevance, 'COMMENTARY');
  const summary = factualResearchSummary(r, buildResearchOverview(r));
  assert.doesNotMatch(summary, /US economic|Deloitte is investing/i);
});

test('three differently worded acquisition reports become one event with preserved citations', () => {
  const overview = buildResearchOverview(record());
  assert.equal(overview.companyEventCount, 2);
  assert.equal(overview.duplicateReportCount, 2);
  assert.equal(overview.commentaryCount, 1);
  const acquisition = overview.events.find(e => e.eventType === 'ACQUISITION');
  assert.deepEqual(new Set(acquisition.sourceIds), new Set(['acq-1', 'acq-2', 'acq-3']));
  assert.equal(acquisition.verification, 'HEADLINE_ONLY');
});

test('different acquired businesses and different office locations do not merge', () => {
  for (const titles of [[
    'Deloitte acquires Alpha AI software business', 'Deloitte acquires Beta AI software business',
  ], ['Deloitte opens a new Singapore office', 'Deloitte opens a new London office']]) {
    const overview = buildResearchOverview({ company, sources: titles.map((title, i) => source('s-' + i, title)) });
    assert.equal(overview.companyEventCount, 2);
    assert.equal(overview.duplicateReportCount, 0);
  }
});

test('AI acquisition supports a labelled exploratory connection without exact product phrases', () => {
  const k = getSeedKnowledge();
  const matches = matchOfferings(k, researchEvidence(record()));
  const ai = matches.find(m => m.offeringId === 'ai-infrastructure-security');
  assert.ok(ai);
  assert.equal(ai.fitLevel, 'EXPLORATORY');
  assert.equal(ai.eventIds.length, 1);
  assert.equal(ai.evidenceIds.length, 3);
  assert.ok(!matches.some(m => m.offeringId === 'cybersecurity'));
});

test('offering a product is distinguished from a company procuring infrastructure', () => {
  const c = { name: 'Google', aliases: [] };
  const r = { company: c, sources: [source('launch', 'Google Cloud launches a new AI service - Example Publisher')] };
  const overview = buildResearchOverview(r);
  assert.equal(overview.events[0].businessRole, 'PROVIDER');
  assert.deepEqual(matchOfferings(getSeedKnowledge(), researchEvidence(r)), []);
});

test('a current cyber incident supports discovery while a security-provider launch does not', () => {
  const k = getSeedKnowledge();
  const incident = { company, sources: [source('breach', 'Deloitte reports a ransomware security incident')] };
  assert.ok(matchOfferings(k, researchEvidence(incident)).some(m => m.offeringId === 'cybersecurity' && m.fitLevel === 'DIRECT_SIGNAL'));
  const launch = { company, sources: [source('launch', 'Deloitte launches a cybersecurity service')] };
  assert.ok(!matchOfferings(k, researchEvidence(launch)).some(m => m.offeringId === 'cybersecurity'));
});

test('valid discovery is not blocked just because confirmation details are still unknown', () => {
  const k = getSeedKnowledge();
  const grounded = groundAnalysis(brief('ai-infrastructure-security', ['acq-1', 'acq-2']), researchEvidence(record()), k);
  assert.equal(grounded.analysis.readiness, 'DISCOVERY_READY');
  assert.equal(grounded.analysis.possibleNeeds[0].fitLevel, 'EXPLORATORY');
  assert.match(grounded.statusReason, /targeted discovery/);
  assert.match(grounded.analysis.nextAction.question, /acquisition/);
  assert.doesNotMatch(grounded.analysis.unknowns.join(' '), /cybersecurity concerns/);
});

test('an irrelevant extra citation is removed without discarding the valid hypothesis', () => {
  const grounded = groundAnalysis(brief('ai-infrastructure-security', ['acq-1', 'identity']), researchEvidence(record()), getSeedKnowledge());
  assert.equal(grounded.analysis.possibleNeeds.length, 1);
  assert.deepEqual(grounded.analysis.possibleNeeds[0].evidenceIds, ['acq-1']);
  assert.equal(grounded.analysis.readiness, 'DISCOVERY_READY');
});

test('the displayed fit level is based on the cited event, not a different available signal', () => {
  const r = record();
  r.sources.push(source('direct', 'Deloitte deploys AI infrastructure for a new workload'));
  const evidence = researchEvidence(r);
  assert.equal(matchOfferings(getSeedKnowledge(), evidence).find(m => m.offeringId === 'ai-infrastructure-security').fitLevel, 'DIRECT_SIGNAL');
  const result = groundAnalysis(brief('ai-infrastructure-security', ['acq-1']), evidence, getSeedKnowledge());
  assert.equal(result.analysis.possibleNeeds[0].fitLevel, 'EXPLORATORY');
});

test('a model cannot flood the brief with repeated or excessive service hypotheses', () => {
  const proposed = brief('ai-infrastructure-security', ['acq-1']);
  const base = proposed.possibleNeeds[0];
  proposed.possibleNeeds = [
    { ...base, offeringId: 'cloud' }, { ...base, offeringId: 'managed-services' },
    { ...base, offeringId: 'ai-infrastructure-security' }, { ...base, offeringId: 'cloud' },
  ];
  const result = groundAnalysis(proposed, researchEvidence(record()), getSeedKnowledge());
  assert.equal(result.analysis.possibleNeeds.length, 2);
  assert.equal(new Set(result.analysis.possibleNeeds.map(n => n.offeringId)).size, 2);
  assert.ok(result.analysis.possibleNeeds.some(n => n.offeringId === result.analysis.recommendedCapability.offeringId));
  assert.match(result.statusReason, /2 service hypotheses/);
});

test('rejected material has a specific explanation rather than a blanket missing-evidence message', () => {
  const grounded = groundAnalysis(brief('ai-infrastructure-security', ['macro']), researchEvidence(record()), getSeedKnowledge());
  assert.equal(grounded.analysis.possibleNeeds.length, 0);
  assert.equal(grounded.rejections[0].code, 'COMMENTARY_NOT_COMPANY_EVENT');
  assert.match(grounded.rejections[0].reason, /commentary|byline/);
  assert.equal(grounded.analysis.readiness, 'NEEDS_RESEARCH');
  const background = groundAnalysis({ ...brief('ai-infrastructure-security', ['identity']) }, researchEvidence({ company, sources: [record().sources[0]] }), getSeedKnowledge());
  assert.equal(background.analysis.readiness, 'HOLD');
});

test('discovery rules are editable and older knowledge documents remain valid', () => {
  const k = getSeedKnowledge();
  for (const offering of k.offerings) { delete offering.discoveryRules; delete offering.signalRules.allowedEventTypes; }
  const legacy = KnowledgeSchema.parse(k);
  assert.equal(legacy.offerings[0].discoveryRules.length, 0);
  assert.ok(!matchOfferings(legacy, researchEvidence(record())).some(m => m.offeringId === 'ai-infrastructure-security'));
});

test('analysis rebuilds facts from approved events and exposes coverage and source limits', async t => {
  const researchStore = require('../dist/integrations/research/store');
  const client = require('../dist/integrations/freellmapi/client').freeLlmClient;
  const originals = { read: businessKnowledgeStore.read, load: researchStore.loadResearch, generate: client.generateText };
  t.after(() => { businessKnowledgeStore.read = originals.read; researchStore.loadResearch = originals.load; client.generateText = originals.generate; });
  businessKnowledgeStore.read = async () => getSeedKnowledge();
  researchStore.loadResearch = async () => record();
  client.generateText = async messages => {
    assert.match(messages[1].content, /EXPLORATORY/);
    assert.match(messages[1].content, /distinctEvents/);
    return { reply: JSON.stringify(brief('ai-infrastructure-security', ['acq-1'])), model: 'test-model' };
  };
  const result = await analyzeCompany('research-test');
  assert.equal(result.analysis.readiness, 'DISCOVERY_READY');
  assert.equal(result.evidenceAssessment.companyEventCount, 2);
  assert.equal(result.evidenceAssessment.duplicateReportCount, 2);
  assert.equal(result.evidenceAssessment.demandConfirmed, false);
  assert.ok(result.evidenceAssessment.sourceLimitations.length);
  assert.doesNotMatch(result.analysis.summary, /US economy|US economic|Deloitte is investing/);
  assert.equal(result.analysis.observedFacts.length, 3);
});
