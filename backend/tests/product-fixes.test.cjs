process.env.STORAGE_MODE = 'memory';
process.env.LOCAL_DEMO_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.SALES_EMAIL_PROVIDER = 'mock';
for (const key of ['AI_API_KEY', 'FREELLMAPI_API_KEY', 'OPENAI_API_KEY', 'AI_BASE_URL', 'AI_MODEL']) process.env[key] = '';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { buildShowcaseData, seedShowcaseData, SHOWCASE_DATASET } = require('../dist/demo/showcase');
const { clearMemoryActivities, allActivityEvents, appendActivity, findCompanyActivities } = require('../dist/salesStore');
const { clearMemoryAiManagement } = require('../dist/ai-management/store');
const { getSalesAnalytics } = require('../dist/services/salesAnalytics');
const { plainEmailBody } = require('../dist/sales/email-format');
const { recordDiscoveryHandoff, sendApprovedEmail, sendAutonomousEmail } = require('../dist/sales/workflow');
const { buildCompanyBrief } = require('../dist/sales/agents/company-context.agent');
const { env } = require('../dist/config/env');
beforeEach(() => { clearMemoryActivities(); clearMemoryAiManagement(); });
const filters = () => ({ startDate: new Date(Date.now() - 30 * 86400000), endDate: new Date(), page: 1, limit: 50 });

test('representative CRM dataset is idempotent and fills charts with consistent cohorts', async () => {
  const first = await seedShowcaseData();
  const eventCount = (await allActivityEvents()).length;
  await seedShowcaseData();
  assert.equal((await allActivityEvents()).length, eventCount);
  assert.equal(first.companies, 12);
  const analytics = await getSalesAnalytics(filters());
  assert.equal(analytics.metrics.totalCompaniesDiscovered, 12);
  assert.equal(analytics.metrics.uniqueCompaniesContacted, 11);
  assert.equal(analytics.metrics.uniqueCompaniesThatReplied, 8);
  assert.equal(analytics.metrics.positiveResponses, 5);
  assert.equal(analytics.metrics.convertedOpportunities, 1);
  assert.equal(analytics.metrics.totalFollowupsSent, 2);
  assert.equal(analytics.metrics.pendingInterventions, 5);
  assert.equal(analytics.metrics.highPriorityInterventions, 5);
  assert.ok(analytics.geography.length >= 3);
  assert.ok(analytics.opportunities.byService.length >= 8);
  assert.ok(analytics.opportunities.newRequirements.length >= 4);
  assert.ok(analytics.containsSyntheticData);
  for (const row of analytics.agentPerformance) assert.ok(row.humanEscalationRatePct <= 100);
  for (const [index, row] of analytics.funnel.entries()) {
    assert.ok(row.conversionPct <= 100);
    if (index) assert.ok(row.companies <= analytics.funnel[index - 1].companies);
  }
});

test('autonomous authorisation counts in the funnel and duplicate country breakdowns merge companies', async () => {
  const base = { companyId: 'regression:one', companyName: 'Test account', country: 'Singapore', industry: 'Technology',
    service: 'Cybersecurity', sourceIds: [], payload: {}, isSynthetic: true, createdAt: new Date(Date.now() - 1000) };
  for (const type of ['DISCOVERED', 'QUALIFIED', 'SELECTED', 'EMAIL_AUTONOMOUS_AUTHORIZED', 'EMAIL_PROVIDER_ACCEPTED']) {
    await appendActivity({ ...base, eventId: 'regression:' + type, type });
  }
  await appendActivity({ ...base, service: 'Cloud', eventId: 'regression:extra', type: 'QUALIFIED' });
  const analytics = await getSalesAnalytics(filters());
  assert.equal(analytics.funnel[3].companies, 1);
  assert.equal(analytics.funnel[4].conversionPct, 100);
  assert.equal(analytics.opportunities.byCountry.find(row => row.country === 'Singapore').count, 1);
});

test('discovery handoff keeps the specific hypothesis citations and exact service match', async () => {
  const context = { companyId: 'regression:scope', companyName: 'Scope account', service: 'Cybersecurity',
    sourceIds: ['relevant', 'background'], evidence: [] };
  await recordDiscoveryHandoff({ ...context, candidates: [{ opportunityId: 'scope:security', service: 'Cybersecurity',
    offeringId: 'cybersecurity', sourceIds: ['relevant'], reason: 'A security review', question: 'Which controls need reviewing?' }] });
  const events = await findCompanyActivities(context.companyId);
  const qualified = events.find(event => event.type === 'QUALIFIED');
  assert.deepEqual(qualified.sourceIds, ['relevant']);
  const brief = await buildCompanyBrief(context, events);
  assert.deepEqual(brief.services.map(item => item.id), ['cybersecurity']);
});

test('email display and sending strip HTML while preserving paragraphs', () => {
  const body = plainEmailBody('<p>Hello<br/>Alex</p><p>Can we meet?</p><script>bad()</script>');
  assert.ok(body.includes('Hello\nAlex'));
  assert.ok(body.includes('\nCan we meet?'));
  assert.ok(!body.includes('<br'));
  assert.ok(!body.includes('bad()'));
  assert.equal(plainEmailBody('Plain text\nSecond line'), 'Plain text\nSecond line');
});

test('sample customer requirements quote actual sample inbound messages and real mail is blocked', async () => {
  const data = buildShowcaseData();
  for (const event of data.events.filter(event => event.type === 'FEEDBACK_CAPTURED')) {
    const inbound = data.events.find(item => item.eventId === event.sourceIds[0]);
    assert.ok(inbound.body.includes(event.payload.requirement));
    assert.equal(event.payload.datasetTag, SHOWCASE_DATASET);
  }
  const previous = env.SALES_EMAIL_PROVIDER;
  env.SALES_EMAIL_PROVIDER = 'gmail';
  try {
    await assert.rejects(sendApprovedEmail({ companyId: 'synthetic:test', companyName: 'Test', isSynthetic: true }, 'test'),
      error => error.code === 'SAMPLE_OUTREACH_DISABLED');
    await assert.rejects(sendAutonomousEmail({ companyId: 'synthetic:test', companyName: 'Test', isSynthetic: true }, 'test'),
      error => error.code === 'SAMPLE_OUTREACH_DISABLED');
  } finally { env.SALES_EMAIL_PROVIDER = previous; }
});
