import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { RankingService } from '../ranking/service';
import { replayEvents, REPO_ROOT } from '../ranking/seed';

async function verify() {
  const service = new RankingService(null), steps: unknown[] = [];
  assert.equal(service.get().total, 11);
  for (const event of replayEvents) {
    await service.apply(event);
    const q = service.get(), etla = q.items.find(r => r.id === 'O01')!;
    steps.push({ eventId: event.eventId, queueVersion: q.queueVersion, count: q.total,
      etla: { rank: etla.rank, score: etla.score, status: etla.status, confidence: etla.rankingConfidence.score, actionConfidence: etla.rankingConfidence.actionScore } });
    if (event.eventId === 'E0-public-etla') { assert.equal(etla.score, 53); assert.equal(etla.rank, 10); }
    if (event.eventId === 'E1-window-etla') { assert.equal(etla.score, 84); assert.equal(etla.rank, 2); assert.equal(etla.rankingConfidence.score, 80); }
    if (event.eventId === 'E3-site-etla') { assert.equal(etla.score, 89); assert.equal(etla.rank, 1); assert.equal(etla.rankingConfidence.score, 100); }
  }
  const before = service.get(); await service.apply(replayEvents[3]); assert.deepEqual(service.get(), before);
  const failed = await service.refresh(true); assert.deepEqual(failed.items, before.items);
  const comparison = service.comparison(); assert.equal(comparison.universe.length, 12);
  await service.reset(true); assert.deepEqual(service.get().items, []);
  const report = { checkedAt: new Date().toISOString(), fixtureVersion: 'singtel-demo-v1', rubricVersion: 'rubric-v1', scenarioVersion: 'scenario-v1',
    status: 'passed', scope: 'Executed application engine and event reducer, duplicate/failure retention, comparisons and empty queue. Does not claim live model or Salesforce validation.', steps, comparison, checks: ['replay goldens', 'duplicate event', 'connector failure retention', 'same-universe comparison', 'initialized empty'] };
  fs.mkdirSync(path.join(REPO_ROOT, '.local'), { recursive: true });
  fs.writeFileSync(path.join(REPO_ROOT, '.local/readiness-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
verify().catch(err => { console.error(err); process.exitCode = 1; });
