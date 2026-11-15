// Scenario 10: AI Management state survives a backend restart.
// Two separate Node processes share one MongoDB database. Requires a MongoDB replica set (Atlas or local):
//   AI_TEST_MONGODB_URI=mongodb://127.0.0.1:27027/?replicaSet=rs0 node --test tests/ai-management-restart.test.cjs
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const uri = process.env.AI_TEST_MONGODB_URI;
const phase = process.argv[2];

function configure() {
  process.env.STORAGE_MODE = 'cloud';
  process.env.LOCAL_DEMO_MODE = 'false';
  process.env.NODE_ENV = 'test';
  process.env.LEAD_RANKING_MODE = 'rules';
  process.env.SALES_EMAIL_PROVIDER = 'mock';
  process.env.LOG_LEVEL = 'error';
  for (const key of ['OPENAI_API_KEY', 'FREELLMAPI_API_KEY', 'AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL']) process.env[key] = '';
}

async function runPhase(name) {
  configure();
  const mongoose = require('mongoose');
  const { randomUUID } = require('node:crypto');
  await mongoose.connect(uri, { dbName: process.env.AI_RESTART_DB, serverSelectionTimeoutMS: 5000 });
  await Promise.all(Object.values(mongoose.models).map(model => model.createIndexes()));
  const app = require('../dist/app').default;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v1/ai-management';
  const call = async (p, method = 'GET', body) => (await fetch(base + p, { method, headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) })).json();
  let output;
  if (name === 'phase1') {
    const { saveResearch } = require('../dist/integrations/research/store');
    const { recordDiscoverySnapshot, recordDiscoveryHandoff } = require('../dist/sales/workflow');
    const entityId = 'Q' + Math.floor(Math.random() * 9_000_000 + 1_000_000);
    const researchId = 'research-' + randomUUID();
    const source = { id: 'source-' + randomUUID(), kind: 'news_headline', title: 'Restart Logistics (Synthetic) opens a new regional hub',
      url: 'https://example.com/news/hub', publisher: 'Synthetic trade news', excerpt: 'Synthetic.', publishedAt: new Date().toISOString(),
      retrievedAt: new Date().toISOString(), contentHash: 'b'.repeat(64), verification: 'headline_only' };
    await saveResearch({ id: researchId, company: { entityId, name: 'Restart Logistics (Synthetic)', description: 'Synthetic logistics company.',
      website: 'https://example.com', wikipediaTitle: null, aliases: [], identitySource: 'synthetic fixture' }, sources: [source], warnings: [], createdAt: new Date().toISOString() });
    const context = { companyId: 'entity:' + entityId, companyName: 'Restart Logistics (Synthetic)', researchId, country: 'Singapore', industry: 'Logistics',
      service: 'Business connectivity', sourceIds: [source.id], evidence: [{ sourceId: source.id, title: source.title, url: source.url, publishedAt: source.publishedAt,
        excerpt: source.excerpt, kind: source.kind, verification: source.verification }] };
    await recordDiscoverySnapshot(context);
    await recordDiscoveryHandoff({ ...context, candidates: [{ opportunityId: 'DISC-' + entityId, service: context.service }] });
    const settings = (await call('/settings')).data;
    const { nextScheduledRunAt, lastRun, lastRankingRunAt, emailProvider, previewSeedingAvailable, settingsKey, lastEmailPollAt, outboundStoppedAt, outboundStopReason, createdAt, updatedAt, ...editable } = settings;
    await call('/settings', 'PUT', { ...editable, dailyTarget: 9, dailyRankingEnabled: true });
    const enabled = await call('/companies/' + encodeURIComponent(context.companyId) + '/enable', 'POST', { actor: 'restart-test', authorizationAcknowledged: true,
      complianceReviewed: true, jurisdiction: 'SG', contact: { name: 'Robin Ng', email: 'robin@restart.example', role: 'IT Director',
        source: 'Synthetic directory verified by salesperson', outreachBasis: 'RECORDED_CONSENT' } });
    output = { companyId: context.companyId, state: enabled.data.company.managementState, communication: enabled.data.company.communicationState,
      nextActionKind: enabled.data.company.nextActionKind, sent: enabled.data.step.status, pid: process.pid };
  } else {
    const companyId = process.env.AI_RESTART_COMPANY;
    const before = (await call('/companies/' + encodeURIComponent(companyId))).data;
    const settings = (await call('/settings')).data;
    const { runAiManagementWorkerTick } = require('../dist/ai-management/orchestrator');
    const tick = await runAiManagementWorkerTick(new Date(Date.now() + 4.2 * 86_400_000));
    const after = (await call('/companies/' + encodeURIComponent(companyId))).data.management;
    const conversation = (await call('/companies/' + encodeURIComponent(companyId) + '/conversations')).data;
    output = { state: before.management.managementState, communication: before.management.communicationState, activatedBy: before.management.activatedBy,
      historyLength: before.management.history.length, dailyTarget: settings.dailyTarget, dailyRankingEnabled: settings.dailyRankingEnabled,
      tick: tick.processed.map(item => item.status), followupAttempts: after.followupAttempts, messages: conversation.messages.map(message => message.kind), pid: process.pid };
  }
  await new Promise(resolve => server.close(resolve));
  if (name === 'phase2') await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  process.stdout.write('\nRESULT ' + JSON.stringify(output) + '\n');
}

if (phase) {
  runPhase(phase).then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
} else {
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  test('10. company management state persists across a backend restart and the worker resumes from it', { skip: !uri && 'Set AI_TEST_MONGODB_URI to a MongoDB replica set' }, () => {
    const db = 'enterprise_radar_ai_restart_' + process.pid;
    const run = (name, extra = {}) => {
      const result = spawnSync(process.execPath, [path.join(__dirname, 'ai-management-restart.test.cjs'), name], {
        env: { ...process.env, AI_RESTART_DB: db, ...extra }, encoding: 'utf8', timeout: 120_000 });
      const line = result.stdout.split('\n').find(item => item.startsWith('RESULT '));
      assert.ok(line, 'phase ' + name + ' failed: ' + result.stderr.slice(-2000));
      return JSON.parse(line.slice('RESULT '.length));
    };
    const first = run('phase1');
    assert.equal(first.state, 'ACTIVE');
    assert.equal(first.sent, 'sent');
    assert.equal(first.nextActionKind, 'NO_REPLY_FOLLOWUP');
    const second = run('phase2', { AI_RESTART_COMPANY: first.companyId });
    assert.notEqual(second.pid, first.pid, 'a separate process with empty memory');
    assert.equal(second.state, 'ACTIVE');
    assert.equal(second.communication, 'FOLLOW_UP_SCHEDULED');
    assert.equal(second.activatedBy, 'restart-test');
    assert.ok(second.historyLength >= 3);
    assert.equal(second.dailyTarget, 9);
    assert.equal(second.dailyRankingEnabled, true);
    assert.ok(second.tick.includes('sent'), 'the restarted worker sends the due follow-up from persisted state');
    assert.equal(second.followupAttempts, 1);
    assert.deepEqual(second.messages, ['initial', 'followup']);
  });
}
