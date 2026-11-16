process.env.STORAGE_MODE = 'memory';
process.env.LOCAL_DEMO_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.SALES_EMAIL_PROVIDER = 'mock';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { env } = require('../dist/config/env');
const { seedShowcaseData, buildShowcaseData } = require('../dist/demo/showcase');
const { restoreShowcaseSession } = require('../dist/scripts/showcase-session');
const { restoreMemoryAnalysis, loadAnalysis } = require('../dist/integrations/research/analysisStore');
const { loadResearch } = require('../dist/integrations/research/store');
const { clearMemoryActivities, allActivityEvents, findActivityById } = require('../dist/salesStore');
const { clearMemoryAiManagement, getAiManagementSettings, findCompanyManagement, getAiNotification } = require('../dist/ai-management/store');
beforeEach(() => { clearMemoryActivities(); clearMemoryAiManagement(); env.STORAGE_MODE = 'memory'; });
function backup() {
  const data = buildShowcaseData(new Date('2026-11-16T02:00:00Z'));
  const row = data.management[0], reportId = 'analysis-' + randomUUID();
  return { format: 'singtel-scout-local-session-v1', source: 'http://127.0.0.1:5217/api/v1', capturedAt: '2026-11-16T03:00:00Z',
    research: [data.research[0]], analyses: [{ id: reportId, companyId: data.research[0].id, createdAt: '2026-11-16T02:10:00Z',
      result: { analysisId: reportId, model: 'recorded-test', analysis: { summary: 'The user reviewed this original report.' } } }],
    events: [{ ...data.events[0], payload: { ...data.events[0].payload, userNote: 'Original source preserved.' } }],
    management: [{ ...row, managementState: 'HUMAN_HANDOVER', humanOwner: 'local_sales_user', memory: { ...row.memory, summary: 'Restored user notes.' } }],
    notifications: [{ ...data.notifications[0], unread: false, status: 'ACKNOWLEDGED', owner: 'local_sales_user' }],
    dailyRuns: [data.run], settings: { ...require('../dist/ai-management/store').DEFAULT_AI_MANAGEMENT_SETTINGS,
      globalOutboundEnabled: false, outboundStoppedAt: '2026-11-16T02:25:00Z', outboundStopReason: 'User paused sending.' },
    limitations: ['Only reports exposed by the read API are captured.'] };
}
test('restoration preserves user event/report IDs, account memory and acknowledged notifications alongside new scenarios', async () => {
  await seedShowcaseData();
  const count = (await allActivityEvents()).length, data = backup();
  const result = await restoreShowcaseSession(data);
  assert.equal(result.totalSalesEvents, count);
  assert.equal((await findActivityById(data.events[0].eventId)).payload.userNote, 'Original source preserved.');
  assert.equal((await loadAnalysis(data.analyses[0].id)).result.analysisId, data.analyses[0].id);
  assert.equal((await loadResearch(data.research[0].id)).createdAt, data.research[0].createdAt);
  const management = await findCompanyManagement(data.management[0].companyId);
  assert.equal(management.managementState, 'HUMAN_HANDOVER');
  assert.equal(management.memory.summary, 'Restored user notes.');
  const note = await getAiNotification(data.notifications[0].notificationId);
  assert.equal(note.status, 'ACKNOWLEDGED'); assert.equal(note.unread, false);
  const settings = await getAiManagementSettings();
  assert.equal(settings.globalOutboundEnabled, false);
  assert.equal(settings.outboundStopReason, 'User paused sending.');
  assert.equal(settings.outboundStoppedAt.toISOString(), '2026-11-16T02:25:00.000Z');
  await restoreShowcaseSession(data);
  assert.equal((await allActivityEvents()).length, count, 'a second restore must not duplicate conversations');
});
test('invalid data is rejected before changing the seeded session', async () => {
  await seedShowcaseData();
  const count = (await allActivityEvents()).length, data = backup();
  data.events[0].createdAt = 'not a date';
  await assert.rejects(restoreShowcaseSession(data), error => error.code === 'INVALID_SESSION_BACKUP');
  assert.equal((await allActivityEvents()).length, count);
});
test('local restore cannot write to a configured cloud database or silently replace report identity', async () => {
  const data = backup();
  env.STORAGE_MODE = 'cloud';
  try {
    await assert.rejects(restoreShowcaseSession(data), error => error.code === 'MEMORY_RESTORE_ONLY');
    assert.throws(() => restoreMemoryAnalysis(data.analyses[0]), error => error.code === 'MEMORY_RESTORE_ONLY');
  } finally { env.STORAGE_MODE = 'memory'; }
  data.analyses[0].result.analysisId = 'analysis-' + randomUUID();
  await assert.rejects(restoreShowcaseSession(data), error => error.code === 'INVALID_SESSION_BACKUP');
});
