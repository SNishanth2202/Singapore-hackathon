import test from 'node:test';
import assert from 'node:assert/strict';
import { RankingService } from '../src/ranking/service';
import { DiscoveryHandoff, integrationEvidence } from '../src/ranking/discovery';
import { fixtureOpportunities } from '../src/ranking/seed';
import { AppError } from '../src/utils/errors';

test('an evidence-qualified discovery hand-off becomes a gated Verify lead without inventing internal facts', async () => {
  const service = new RankingService(null);
  const asOf = service.get().asOf;
  const id = 'DISC-test-connectivity';
  const handoff: DiscoveryHandoff = {
    researchId: 'research-12345678-abcd-abcd-abcd-123456789012',
    company: { entityId: 'Q123', name: 'Example Logistics' }, sources: [],
    fact: 'Discovery hand-off test',
    opportunities: [{
      id, accountId: 'DISC-Q123', account: 'Example Logistics', parent: 'Discovery research account',
      buyingUnitId: 'DISC-BUYING-UNIT-Q123', buyingUnit: 'Unverified buying unit',
      siteId: 'DISC-SITE-Q123', address: 'Exact service site not yet confirmed', product: 'International connectivity',
      useCase: 'A dated company event matches a configured service rule.', buyingWindowId: 'DISC-WINDOW-Q123',
      ownerId: 'DISCOVERY-TRIAGE', owner: 'Discovery triage queue', contactId: '', need: 15, needOrigin: 'public',
      evidenceIds: ['discovery:source-1'], needEvidenceIds: ['discovery:source-1'], catalogAvailable: true,
      deadline: null, deadlineKind: 'No purchasing window confirmed', windowConfirmed: false, deadlineAlternatives: [],
      readyBy: '2027-02-13T01:00:00.000Z', siteState: 'UNKNOWN', technicalState: 'UNKNOWN',
      siteAssessedAt: asOf, technicalAssessedAt: asOf, siteEvidenceId: `integration-site-${id}`,
      technicalEvidenceId: `integration-technical-${id}`, diversePaths: null, latencyMs: null, directFit: true,
      recentActivityAt: '2026-11-14T01:00:00.000Z', annualContributionSgd: 0, annualDealValueSgd: 0,
      pursuitHours: 24, estimated: false, caseOpen: false, caseDueAt: null, matchStatus: 'ambiguous',
      matchCandidates: [], unbounded: false, siteUncertain: true, hiddenUntilTrigger: false, isSynthetic: true,
    }],
  };
  const queue = await service.ingestDiscovery(handoff);
  const row = queue.items.find(item => item.id === id);
  assert.ok(row);
  assert.equal(row.status, 'Verify');
  assert.equal(row.actionCode, 'VERIFY_MATCH');
  assert.equal(row.owner, 'Discovery triage queue');
  assert.equal(row.annualContributionSgd, 0);
  assert.ok(row.evidence.some(evidence => evidence.id === `integration-site-${id}`));
  assert.equal(integrationEvidence(handoff, asOf).length, 5);
});

test('Discovery customer matches are rejected before candidates are ingested', async () => {
  const service = new RankingService(null), before = service.get();
  const handoff: DiscoveryHandoff = {
    researchId: 'research-12345678-abcd-abcd-abcd-123456789012',
    company: { entityId: 'Q-known-micron', name: 'Micron Technology Inc.' }, sources: [], fact: 'Customer exclusion test',
    opportunities: [{ ...fixtureOpportunities()[0], id: 'DISC-known-micron', accountId: 'DISC-Q-known-micron',
      account: 'Micron Singapore Pte. Ltd.', parent: 'Micron Technology', hiddenUntilTrigger: false }],
  };
  await assert.rejects(service.ingestDiscovery(handoff), e => e instanceof AppError && e.code === 'SINGTEL_CUSTOMER_EXCLUDED');
  assert.deepEqual(service.get(), before);
  assert.ok(!service.inspect().opportunities.some(o => o.id === 'DISC-known-micron'));
});
