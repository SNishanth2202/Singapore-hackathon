process.env.STORAGE_MODE = 'memory';
process.env.NODE_ENV = 'test';
process.env.LOCAL_DEMO_MODE = 'true';
for (const key of ['AI_API_KEY', 'FREELLMAPI_API_KEY', 'OPENAI_API_KEY']) process.env[key] = '';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createSalesContextResolver, resolveSalesContext } = require('../dist/sales/context');
const { buildShowcaseData, seedShowcaseData } = require('../dist/demo/showcase');
const { clearMemoryActivities, allActivityEvents } = require('../dist/salesStore');
const { clearMemoryAiManagement } = require('../dist/ai-management/store');
const { selectCompany, sendApprovedEmail, sendAutonomousEmail } = require('../dist/sales/workflow');
const { env } = require('../dist/config/env');

beforeEach(() => { clearMemoryActivities(); clearMemoryAiManagement(); });

test('profile ObjectId, research snapshot and sales identity reuse one timeline and preserve exact evidence', async () => {
  const now = new Date();
  await seedShowcaseData(now);
  const data = buildShowcaseData(now), profile = data.profiles[0], research = data.research[0];
  const originalCount = (await allActivityEvents()).length;
  const contexts = await Promise.all([profile._id, research.id, profile.salesCompanyId].map(resolveSalesContext));
  for (const context of contexts) {
    assert.equal(context.companyId, profile.salesCompanyId);
    assert.equal(context.researchId, research.id);
    assert.equal(context.isSynthetic, true);
    assert.equal(context.country, profile.country);
    assert.deepEqual(context.sourceIds, research.sources.map(source => source.id));
    assert.deepEqual(context.evidence[0], { sourceId: research.sources[0].id, title: research.sources[0].title,
      url: research.sources[0].url, publishedAt: research.sources[0].publishedAt, excerpt: research.sources[0].excerpt,
      kind: research.sources[0].kind, verification: research.sources[0].verification });
  }
  assert.equal((await allActivityEvents()).length, originalCount, 'resolving alternate routes does not mutate the timeline');
  await selectCompany(contexts[0]);
  const afterFirstSelection = (await allActivityEvents()).length;
  for (const context of contexts.slice(1)) await selectCompany(context);
  assert.equal((await allActivityEvents()).length, afterFirstSelection, 'alternate routes reuse the existing selection and brief');
});

test('every identifier for an illustrative account retains the real-email sending guard', async () => {
  await seedShowcaseData();
  const data = buildShowcaseData(), profile = data.profiles[0];
  const previousProvider = env.SALES_EMAIL_PROVIDER;
  env.SALES_EMAIL_PROVIDER = 'gmail';
  try {
    for (const key of [profile._id, data.research[0].id, profile.salesCompanyId]) {
      const context = await resolveSalesContext(key);
      await assert.rejects(sendApprovedEmail(context, 'any-draft'), error => error.code === 'SAMPLE_OUTREACH_DISABLED');
      await assert.rejects(sendAutonomousEmail(context, 'any-draft'), error => error.code === 'SAMPLE_OUTREACH_DISABLED');
    }
  } finally { env.SALES_EMAIL_PROVIDER = previousProvider; }
});

test('a recorded research identity overrides reconstruction and retains an explicit profile binding', async () => {
  const research = buildShowcaseData().research[0];
  const recorded = { eventId: 'discovery:stored', companyId: 'crm:account-17', companyName: 'Stored account',
    researchId: research.id, sourceIds: ['stored-source'], isSynthetic: false, type: 'DISCOVERED', payload: {},
    country: 'Singapore', createdAt: new Date() };
  const calls = [];
  const resolve = createSalesContextResolver({
    async loadResearch(id) { assert.equal(id, research.id); return research; },
    async findResearchActivity() { return recorded; },
    async findCompanyBinding(id) { calls.push(id); return { companyName: 'Stored account', salesCompanyId: 'crm:account-17', isSynthetic: true }; },
    async findCompanyActivities(id) { assert.equal(id, 'crm:account-17'); return [recorded]; },
  });
  const context = await resolve(research.id);
  assert.equal(context.companyId, 'crm:account-17');
  assert.equal(context.isSynthetic, true);
  assert.deepEqual(calls, ['crm:account-17']);
});

test('public research keeps its entity identity and canonical routes use the latest saved discovery', async () => {
  const oldResearch = buildShowcaseData().research[0];
  const latestResearch = { ...oldResearch, id: 'research-11111111-2222-3333-4444-555555555555',
    company: { ...oldResearch.company, entityId: 'Q12345', name: 'Public company' }, sources: [{ ...oldResearch.sources[0], id: 'current-source' }] };
  const activity = { eventId: 'new-snapshot', type: 'DISCOVERED', companyId: 'entity:Q12345', companyName: 'Public company',
    researchId: latestResearch.id, sourceIds: ['current-source'], isSynthetic: false, payload: {}, createdAt: new Date() };
  let events = [];
  const resolve = createSalesContextResolver({
    async loadResearch(id) { return id === latestResearch.id ? latestResearch : oldResearch; },
    async findResearchActivity() { return null; }, async findCompanyBinding() { return null; },
    async findCompanyActivities() { return events; },
  });
  const before = await resolve(latestResearch.id);
  assert.equal(before.companyId, 'entity:Q12345');
  assert.equal(before.isSynthetic, false);
  events = [{ ...activity, researchId: oldResearch.id, createdAt: new Date(0) }, activity];
  const context = await resolve('entity:Q12345');
  assert.equal(context.researchId, latestResearch.id);
  assert.deepEqual(context.sourceIds, ['current-source']);
});
