import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RankingService } from '../src/ranking/service';
import { replayEvents, fixtureOpportunities, makeSeed } from '../src/ranking/seed';
import { gates, priorityStatusFor, rankQueue, scoreOpportunity, timingPoints } from '../src/ranking/engine';
import { DAY, T0, clone } from '../src/ranking/contracts';

async function through(index: number, service = new RankingService(null)) {
  for (const event of replayEvents.slice(0, index + 1)) await service.apply(event);
  return service;
}
const etla = (s: RankingService) => s.get().items.find(r => r.id === 'O01')!;

test('priority statuses use explicit score boundaries independently of mandatory action gates', () => {
  assert.deepEqual([0, 24, 25, 49, 50, 69, 70, 84, 85, 100].map(priorityStatusFor),
    ['Irrelevant', 'Irrelevant', 'Low priority', 'Low priority', 'Normal priority', 'Normal priority', 'Urgent', 'Urgent', 'Very urgent', 'Very urgent']);
  const candidate = fixtureOpportunities().find(o => o.id === 'O03')!;
  const blocked = scoreOpportunity({ ...candidate, siteState: 'FAIL' }, T0);
  assert.equal(blocked.status, 'Blocked');
  assert.equal(blocked.priorityStatus, priorityStatusFor(blocked.score));
  assert.ok(['Urgent', 'Very urgent'].includes(blocked.priorityStatus));
});

test('public trigger creates a specific opportunity; CRM window and site proof reproduce goldens', async () => {
  const s = new RankingService(null);
  assert.equal(s.get().total, 15);
  await s.apply(replayEvents[0]);
  assert.equal(s.get().total, 16);
  assert.equal(etla(s).score, 53); assert.equal(etla(s).rank, 13); assert.equal(etla(s).status, 'Verify');
  assert.equal(etla(s).priorityStatus, 'Normal priority');
  assert.ok(etla(s).evidence.some(e => e.id === 'S02' && e.url?.startsWith('https://')));
  await s.apply(replayEvents[1]);
  const before = etla(s);
  assert.equal(before.score, 84); assert.equal(before.rank, 3); assert.equal(before.movement, 10);
  assert.equal(before.priorityStatus, 'Urgent');
  assert.equal(before.actionCode, 'VERIFY_SITE'); assert.equal(before.previousDecision?.actionCode, 'VERIFY_BUYING_WINDOW');
  assert.equal(before.rankingConfidence.score, 80); assert.equal(before.rankingConfidence.actionScore, 30);
  assert.deepEqual(before.rankingConfidence.scenarios.map(w => w.rank), [3,1,1,1,15,15,3,1,3,1]);
  assert.equal(before.rankingConfidence.minRank, 1); assert.equal(before.rankingConfidence.maxRank, 15);
  await s.apply(replayEvents[2]); await s.apply(replayEvents[3]);
  const after = etla(s);
  assert.equal(after.score, 89); assert.equal(after.rank, 1); assert.equal(after.movement, 2);
  assert.equal(after.status, 'Pursue'); assert.equal(after.rankingConfidence.score, 100);
  assert.equal(after.priorityStatus, 'Very urgent');
  assert.equal(after.rankingConfidence.actionScore, 100);
  assert.deepEqual(after.rankingConfidence.scenarios.map(w => w.rank), Array(10).fill(1));
  assert.equal(after.components.reduce((n, p) => n + p.points, 0), 89);
});
test('same event is an exact no-op; conflicting duplicate and out-of-order versions are rejected', async () => {
  const s = await through(1), before = s.get();
  await s.apply(replayEvents[1]); assert.deepEqual(s.get(), before);
  await assert.rejects(s.apply({ ...replayEvents[1], description: 'Changed payload' }), /different payload/);
  await assert.rejects(s.apply({ ...replayEvents[3], aggregateVersion: 6 }), /Expected aggregate version/);
  assert.deepEqual(s.get(), before);
});
test('repeat resets and replay produce identical ordered decisions and hashes', async () => {
  const s = await through(3), first = s.get();
  await s.reset(); await through(3, s);
  assert.deepEqual(s.get(), first);
});
test('a failed public refresh preserves exact rows, version and computed time', async () => {
  const s = await through(3), before = s.get();
  const after = await s.refresh(true);
  assert.deepEqual(after.items, before.items); assert.equal(after.queueVersion, before.queueVersion);
  assert.equal(after.queueComputedAt, before.queueComputedAt); assert.equal(after.degraded, true);
  const repaired = await s.refresh(false, async () => s.inspect().sources);
  assert.equal(repaired.degraded, false); assert.equal(repaired.queueVersion, before.queueVersion);
});
test('mandatory gates independently enforce unknown/failure/pass and latency is product-specific', () => {
  const candidate = fixtureOpportunities().find(o => o.id === 'O03')!;
  for (const key of ['siteState', 'technicalState'] as const) {
    const o = clone(candidate); o[key] = 'UNKNOWN'; if (key === 'technicalState') o.diversePaths = null;
    assert.equal(scoreOpportunity(o, T0).status, 'Verify'); o[key] = 'FAIL'; if (key === 'technicalState') o.diversePaths = 1;
    assert.equal(scoreOpportunity(o, T0).status, 'Blocked');
  }
  const noDate = { ...candidate, deadline: null };
  assert.equal(scoreOpportunity(noDate, T0).status, 'Verify');
  assert.equal(scoreOpportunity({ ...candidate, deadline: T0 }, T0).status, 'Blocked');
  const private5g = fixtureOpportunities().find(o => o.id === 'O15')!;
  assert.equal(scoreOpportunity(private5g, T0).status, 'Verify');
  assert.equal(scoreOpportunity({ ...private5g, latencyMs: 28 }, T0).status, 'Blocked');
  assert.equal(scoreOpportunity({ ...private5g, latencyMs: 10 }, T0).status, 'Pursue');
  assert.equal(gates(private5g, T0)[0].state, 'PASS'); // WAN/site availability alone never passes its latency gate.
});
test('service case controls next action, and all mandatory failures take precedence', async () => {
  const s = await through(2), o = s.get().items.find(r => r.id === 'O02')!;
  assert.equal(o.status, 'Resolve'); assert.equal(o.score, 88);
  await s.apply({ eventId: 'test-fail', aggregateId: 'O02', aggregateVersion: 2, eventType: 'SiteAssessmentCompleted', payload: { state: 'FAIL' } });
  assert.equal(s.get().items.find(r => r.id === 'O02')?.status, 'Blocked');
});
test('ambiguous entity matches are retained for verification and unbounded inputs propagate conservatively', async () => {
  const s = await through(1);
  await s.apply({ eventId: 'ambiguous', aggregateId: 'O08', aggregateVersion: 1, eventType: 'AmbiguousMatchDetected', payload: { candidates: ['a', 'b'] } });
  assert.equal(s.get().items.find(r => r.id === 'O08')?.actionCode, 'VERIFY_MATCH');
  await s.apply({ eventId: 'unbounded', aggregateId: 'O01', aggregateVersion: 3, eventType: 'AssumptionBoundsRemoved', payload: {} });
  assert.equal(etla(s).rankingConfidence.score, null);
  assert.ok(s.get().items.some(r => r.id !== 'O01' && r.rankingConfidence.score === null));
  assert.equal(s.get().items.find(r => r.id === 'O16')?.rankingConfidence.score, 100);
});
test('clock boundaries, stale assessments and no-op ticks are explicit', async () => {
  const due = (days: number) => new Date(Date.parse(T0) + days * DAY).toISOString();
  assert.equal(timingPoints(due(7), T0), 20); assert.equal(timingPoints(due(7 + 1/86400), T0), 16);
  assert.equal(timingPoints(due(30), T0), 16); assert.equal(timingPoints(due(90), T0), 10);
  assert.equal(timingPoints(due(180), T0), 5); assert.equal(timingPoints(T0, T0), 0);
  const s = await through(3), before = s.get();
  await s.advance(new Date(Date.parse(T0) + 1000).toISOString());
  assert.deepEqual(s.get().items, before.items); assert.equal(s.get().queueVersion, before.queueVersion);
  await s.advance(due(6)); assert.equal(s.get().items.find(r => r.id === 'O02')?.status, 'Blocked');
  const candidate = fixtureOpportunities().find(o => o.id === 'O12')!;
  assert.equal(gates(candidate, due(31))[0].state, 'UNKNOWN');
});
test('comparison uses the same candidate universe and public facts contribute precisely 15 need points', async () => {
  const s = await through(3), c = s.comparison();
  assert.equal(c.universe.length, 16); assert.equal(new Set(c.universe).size, 16);
  assert.deepEqual(c.summaries.deal_value.topFive, ['O15', 'O12', 'O09', 'O16', 'O08']);
  assert.equal(c.rows.find(r => r.id === 'O01')?.addedPoints, 15);
  assert.ok(c.rows.find(r => r.id === 'O01')!.crmRank > 5);
  assert.equal(s.get('crm_only').items.find(r => r.id === 'O01')?.deadline, etla(s).deadline);
  assert.ok(s.get('crm_only').items.every(r => r.evidence.every(e => e.origin !== 'public')));
  assert.equal(c.ablations.length, 6);
});
test('empty is initialized and persisted queue survives process/service reload', async () => {
  const location = path.join(os.tmpdir(), `singtel-ranking-${process.pid}-${Date.now()}.json`);
  try {
    const s = new RankingService(location); await through(3, s);
    const restored = new RankingService(location); assert.deepEqual(restored.get(), s.get());
    await restored.reset(true); assert.deepEqual(restored.get().items, []); assert.equal(restored.get().initialized, true);
    assert.equal(new RankingService(location).get().total, 0);
  } finally { if (fs.existsSync(location)) fs.unlinkSync(location); }
});
test('saved queues gain priority labels without resetting replay, movement or source-failure state', async () => {
  const location = path.join(os.tmpdir(), `singtel-priority-upgrade-${process.pid}-${Date.now()}.json`);
  try {
    const service = await through(3, new RankingService(location));
    await service.refresh(true);
    const expected = service.inspect();
    // Reproduce a file written before score-based status labels existed.
    const old = JSON.parse(JSON.stringify(expected, (key, value) => key === 'priorityStatus' ? undefined : value));
    fs.writeFileSync(location, JSON.stringify(old));
    const restored = new RankingService(location);
    assert.deepEqual(restored.inspect(), expected);
    const before = restored.get();
    await restored.refresh(false, async () => restored.inspect().sources);
    assert.deepEqual(restored.get().items, before.items);
    assert.equal(restored.get().queueVersion, before.queueVersion);
  } finally { if (fs.existsSync(location)) fs.unlinkSync(location); }
});

test('stable tiebreak uses deadline then canonical ID and waiting/blocked stay below actionable rows', () => {
  const seed = makeSeed(), a = clone(seed.opportunities.find(o => o.id === 'O03')!), b = { ...clone(a), id: 'ZZZ' };
  const q = rankQueue([b, a], seed.evidence, T0); // Both need evidence IDs retained from the original fixture.
  assert.deepEqual(q.map(r => r.id), ['O03', 'ZZZ']);
  const s = new RankingService(null); assert.equal(s.get().items.at(-1)?.status, 'Blocked');
});
test('failed first initialization is distinct from a healthy empty list', () => {
  const service = new RankingService(null, () => { throw new Error('Source seed unreadable'); });
  const q = service.get(); assert.deepEqual(q.items, []); assert.equal(q.initialized, false);
  assert.equal(q.degraded, true); assert.equal(q.lastSuccessfulRefreshAt, null);
  assert.match(q.sourceError!, /Initialization failed/);
});
test('technical events require a consistent measured result; unknown clears previous measurements', async () => {
  const service = await through(3);
  await assert.rejects(service.apply({ eventId: 'invalid-measurement', aggregateId: 'O15', aggregateVersion: 1, eventType: 'TechnicalAssessmentCompleted', payload: { state: 'PASS', latencyMs: 28 } }), /conflicts/);
  await service.apply({ eventId: 'unknown-route', aggregateId: 'O03', aggregateVersion: 1, eventType: 'TechnicalAssessmentCompleted', payload: { state: 'UNKNOWN' } });
  assert.equal(service.get().items.find(o => o.id === 'O03')?.status, 'Verify');
});
