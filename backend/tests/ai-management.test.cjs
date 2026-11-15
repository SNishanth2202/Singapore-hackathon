process.env.STORAGE_MODE = 'memory';
process.env.LOCAL_DEMO_MODE = 'false';
process.env.NODE_ENV = 'test';
process.env.LEAD_RANKING_MODE = 'rules';
process.env.SALES_EMAIL_PROVIDER = 'mock';
process.env.OPENAI_API_KEY = '';
process.env.FREELLMAPI_API_KEY = '';
process.env.AI_API_KEY = '';
process.env.AI_BASE_URL = '';
process.env.AI_MODEL = '';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../dist/app').default;
const { clearMemoryAiManagement } = require('../dist/ai-management/store');

let server, baseUrl;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/api/v1/ai-management';
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });
beforeEach(() => clearMemoryAiManagement());

async function request(path, method = 'GET', body) {
  const response = await fetch(baseUrl + path, { method, headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, json: await response.json() };
}

function settingsPayload(data, overrides = {}) {
  const fields = ['dailyRankingEnabled', 'dailyTarget', 'preferredTime', 'timezone', 'minimumScore', 'minimumConfidence',
    'globalOutboundEnabled', 'followupIntervalsDays', 'maxFollowups', 'noResponseCloseDays', 'minimumAutoConfidence', 'minimumOutreachConfidence',
    'maxProactiveEmailsPer7Days', 'minimumHoursBetweenProactiveEmails', 'consentOnlyJurisdictions', 'inboxPollIntervalMinutes'];
  return Object.fromEntries([['version', data.version], ...fields.map(key => [key, data[key]]), ...Object.entries(overrides)]);
}

test('ranking settings are validated, versioned and retained by the API', async () => {
  const initial = await request('/settings');
  assert.equal(initial.status, 200);
  assert.equal(initial.json.data.dailyTarget, 20);
  const invalid = await request('/settings', 'PUT', settingsPayload(initial.json.data, { timezone: 'Not/AZone' }));
  assert.equal(invalid.status, 400);
  const updated = await request('/settings', 'PUT', settingsPayload(initial.json.data, { dailyTarget: 7, dailyRankingEnabled: true }));
  assert.equal(updated.status, 200);
  assert.equal(updated.json.data.dailyTarget, 7);
  const conflict = await request('/settings', 'PUT', settingsPayload(initial.json.data, { dailyTarget: 8 }));
  assert.equal(conflict.status, 409);
  assert.equal((await request('/settings')).json.data.dailyTarget, 7);
});

test('manual ranking run reports only imported discovery companies and never fills the target with fixtures', async () => {
  const run = await request('/daily-runs/run', 'POST', {});
  assert.ok([200, 201].includes(run.status));
  assert.equal(run.json.data.status, 'COMPLETED');
  assert.ok(run.json.data.selected <= 20);
  assert.ok(run.json.data.selectedLeads.every(item => item.companyId.startsWith('entity:Q')));
  assert.ok(run.json.data.selectedLeads.every(item => item.opportunityId.startsWith('DISC-')));
  assert.ok(run.json.data.selectedLeads.every(item => item.sourceIds.length > 0));
  const history = await request('/daily-runs?limit=5');
  assert.equal(history.json.data[0].runId, run.json.data.runId);
});
