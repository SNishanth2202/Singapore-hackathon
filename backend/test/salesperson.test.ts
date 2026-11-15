import test from 'node:test';
import assert from 'node:assert/strict';
import { RankingService } from '../src/ranking/service';
import { allocateLeads, salespersonQueue, SALESPERSONS } from '../src/ranking/salesperson';
import { readCustomerDatabase } from '../src/ranking/customer-eligibility';
const db = readCustomerDatabase();
const service = new RankingService(null);
test('shared assignments respect capacity, account grouping and all views', () => {
  const canonical = service.get(), allocation = allocateLeads(canonical.items, db), owners = new Map<string, string>();
  for (const row of canonical.items) { const assigned = allocation.get(row.id); if (!assigned) continue; if (owners.has(row.accountId)) assert.equal(owners.get(row.accountId), assigned.salespersonId); owners.set(row.accountId, assigned.salespersonId); }
  for (const p of SALESPERSONS) {
    assert.ok([...allocation.values()].filter(x => x.salespersonId === p.id).length + p.currentLoad <= p.capacity);
    for (const view of ['crm_plus_public', 'crm_only', 'deal_value'] as const) {
      const q = salespersonQueue(service.get(view), canonical, db, p.id);
      assert.ok(q.items.every(row => allocation.get(row.id)?.salespersonId === p.id));
      assert.deepEqual(q.items.map(row => row.rank), q.items.map((_, i) => i + 1));
    }
  }
});
test('former customers are eligible and require a departure review', () => {
  const row = service.get().items[0];
  const formerDb = { ...db, customers: [...db.customers, { id: 'former-test', name: row.account, accountIds: [row.accountId], aliases: [], groupNames: [], basis: 'synthetic_crm' as const, status: 'former' as const, sourceUrl: 'https://example.com/', sourceDate: '2026-01-01', evidence: 'Synthetic former customer' }] };
  const s = new RankingService(null, undefined, () => formerDb), q = s.get();
  assert.ok(q.items.some(x => x.id === row.id && x.customerCheck?.result === 'former_mock_customer'));
  let found = false;
  for (const p of SALESPERSONS) { const personal = salespersonQueue(q, q, formerDb, p.id), former = personal.items.findIndex(x => x.id === row.id); if (former >= 0) { found = true; assert.match(personal.items[former].nextAction, /previous account manager/); assert.ok(personal.items.slice(former).every(x => x.customerCheck?.result === 'former_mock_customer')); } }
  assert.ok(found);
});
