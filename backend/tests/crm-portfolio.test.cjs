process.env.NODE_ENV = 'test';
process.env.STORAGE_MODE = 'memory';
process.env.CRM_SOURCE_MONGODB_URI = '';
process.env.CRM_SOURCE_USE_SAVED_VIEW = 'false';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildCrmPortfolio, CRM_SOURCE_COLLECTIONS } = require('../dist/crm/portfolio');
const { createPortfolioStore, writePortfolioView, validatePortfolioView } = require('../dist/crm/portfolio-store');
const { createPortfolioRouter } = require('../dist/crm/portfolio-routes');
const now = () => new Date('2026-11-16T00:00:00Z');

function source() {
  const data = Object.fromEntries(CRM_SOURCE_COLLECTIONS.map(name => [name, []]));
  data.customers = ['A', 'B'].map(id => ({ customer_id: id, company_name: 'Same named company', country: 'Singapore', industry: 'Logistics', account_manager_id: 'OWNER-' + id, operational_data_type: 'SYNTHETIC', data_origin: 'SYNTHETIC', dataset_tag: 'test-import' }));
  data.subscriptions = ['A', 'B'].map(id => ({ customer_id: id, subscription_id: 'S-' + id, monthly_base_fee_sgd: id === 'A' ? 100 : 200, included_data_gb: 100, service_category: 'Cloud Connectivity', plan_name: 'Plan', contract_end: new Date(id === 'A' ? '2026-10-28' : '2027-01-01'), contract_status: 'Active' }));
  data.usage_records = [{ usage_id: 'U1', customer_id: 'A', subscription_id: 'S-A', period: '2026-10', site_id: 'SITE1', data_usage_gb: 60 }, { usage_id: 'U2', customer_id: 'A', subscription_id: 'S-A', period: '2026-10', site_id: 'SITE2', data_usage_gb: 70 }, { usage_id: 'U3', customer_id: 'B', subscription_id: 'S-B', period: '2026-10', site_id: 'SITE3', data_usage_gb: 20 }];
  data.invoices = ['A', 'B'].flatMap(id => ['2025-10', '2026-10'].map(period => ({ invoice_id: id + period, customer_id: id, subscription_id: 'S-' + id, billing_period: period, base_charge_sgd: id === 'A' ? 100 : 200, total_amount_sgd: (id === 'A' ? 100 : 200) * (period === '2026-10' ? 1.1 : 1), payment_status: id === 'A' ? 'Overdue' : 'Paid', payment_date: new Date('2026-10-30') })));
  data.network_performance = [{ record_id: 'N1', customer_id: 'A', period: '2026-10', service_type: 'Cloud Connectivity', availability_percentage: 99.5, sla_target_percentage: 99.9, sla_breached: false }];
  data.interactions = [{ interaction_id: 'I1', customer_id: 'A', interaction_date: '2026-09-01', sentiment: 'Positive', satisfaction_score: 9 }, { interaction_id: 'I2', customer_id: 'A', interaction_date: '2026-10-25', sentiment: 'Negative', satisfaction_score: 3 }];
  data.sales_opportunities = [{ opportunity_id: 'O1', customer_id: 'A', status: 'Open', estimated_annual_value_sgd: 1200, probability_pct: 50, opportunity_type: 'Capacity Upgrade', expected_close_date: '2026-10-20' }, { opportunity_id: 'O2', customer_id: 'B', status: 'Closed Won', estimated_annual_value_sgd: 2400, probability_pct: 100, expected_close_date: '2026-10-20' }];
  data.account_relationships = [{ relationship_id: 'R1', parent_customer_id: 'A', child_customer_id: 'B', relationship_type: 'Affiliate', relationship_status: 'Synthetic - Needs Validation' }];
  return data;
}

test('portfolio sums shared subscription usage before calculating capacity and keeps equally named accounts separate', () => {
  const view = buildCrmPortfolio(source(), { now: now() });
  assert.equal(view.accounts.length, 2);
  assert.equal(view.details.A.subscriptions[0].utilisationPct, 130);
  assert.equal(view.metrics.capacityAccounts, 1);
  assert.equal(view.metrics.capacitySubscriptions, 1);
  assert.equal(view.metrics.optimisationSubscriptions, 1);
  assert.equal(view.details.A.subscriptions[0].siteCount, 2);
  assert.equal(view.details.A.account.billedSgd, 110);
  assert.equal(view.details.B.account.billedSgd, 220);
  assert.equal(view.metrics.billedSgd, 330);
  assert.equal(view.metrics.billingChangePct, 10);
  assert.equal(view.metrics.openAnnualSgd, 1200);
  assert.equal(view.metrics.weightedOpenAnnualSgd, 600);
  assert.equal(view.metrics.staleOpportunities, 1);
});
test('service recovery, stale contracts and source provenance survive projection without treating invoice amounts as collected cash', () => {
  const view = buildCrmPortfolio(source(), { now: now() });
  assert.equal(view.quality.availabilityFlagMismatches, 1);
  assert.equal(view.metrics.serviceReviewAccounts, 1);
  assert.equal(view.metrics.flaggedBreachAccounts, 0);
  assert.equal(view.metrics.contractReviews, 1);
  assert.equal(view.details.A.account.primaryAction.kind, 'engagement');
  assert.equal(view.details.A.account.latestSentiment, 'Negative');
  assert.equal(view.details.A.subscriptions[0].status, 'Contract review');
  assert.equal(view.details.A.subscriptions[0].recordedStatus, 'Active');
  assert.equal(view.details.A.provenance.operationalDataType, 'SYNTHETIC');
  assert.equal(view.details.A.relationships[0].accountId, 'B');
  assert.equal(view.details.B.relationships[0].accountId, 'A');
  assert.equal(view.quality.overdueWithPaymentDate, 2);
  assert.equal(view.quality.missingInvoiceDueDates, 4);
  assert.ok(view.details.A.actions.find(row => row.kind === 'payment').nextStep.includes('verify payment dates'));
  assert.ok(!('cashCollected' in view.metrics));
});
test('invalid numeric fields, duplicate identities and cross-account references cannot silently inflate the dashboard', () => {
  for (const mutate of [data => data.customers.push(data.customers[0]), data => data.usage_records[0].customer_id = 'B', data => data.account_relationships[0].child_customer_id = 'missing', data => data.invoices[0].total_amount_sgd = NaN, data => delete data.subscriptions[0].included_data_gb]) {
    const data = source(); mutate(data);
    assert.throws(() => buildCrmPortfolio(data), error => error.code === 'CRM_SOURCE_INVALID');
  }
});
test('zero allowance has no invented utilisation and no capacity recommendation', () => {
  const data = source(); data.subscriptions[0].included_data_gb = 0;
  const view = buildCrmPortfolio(data, { now: now() });
  assert.equal(view.details.A.subscriptions[0].utilisationPct, null);
  assert.equal(view.metrics.capacitySubscriptions, 0);
});
test('one source read serves concurrent requests; errors remain generic and do not leak credentials or substitute records', async () => {
  let reads = 0;
  const store = createPortfolioStore({ uri: 'private-source', now, read: async () => { reads++; await new Promise(resolve => setTimeout(resolve, 10)); return { data: source(), database: 'source-db' }; } });
  const [a, b] = await Promise.all([store.get(), store.get()]);
  assert.equal(reads, 1); assert.equal(a, b); assert.equal(a.source.database, 'source-db');
  await store.get(); assert.equal(reads, 1);
  const failure = createPortfolioStore({ uri: 'private-source', read: async () => { throw new Error('private-host authentication failed'); } });
  await assert.rejects(failure.get(), error => error.code === 'CRM_SOURCE_UNAVAILABLE' && !/secret|private-host/.test(error.message));
  await assert.rejects(createPortfolioStore().get(), error => error.code === 'CRM_SOURCE_NOT_CONFIGURED');
});
test('saved view is loaded explicitly with its original reporting and sync dates; missing or corrupt caches never become fixtures', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'scout-crm-view-'));
  const filename = path.join(directory, 'view.json');
  try {
    const view = buildCrmPortfolio(source(), { now: now() });
    await writePortfolioView(filename, view);
    const store = createPortfolioStore({ savedViewOnly: true, cachePath: filename });
    const loaded = await store.get();
    assert.equal(store.mode, 'saved'); assert.equal(loaded.refreshedAt, view.refreshedAt);
    const broken = structuredClone(view); broken.details.A.account.id = 'B';
    assert.throws(() => validatePortfolioView(broken), error => error.code === 'CRM_VIEW_INVALID');
    await fs.writeFile(filename, '{}');
    await assert.rejects(store.get(true), error => error.code === 'CRM_VIEW_INVALID');
    await assert.rejects(createPortfolioStore({ savedViewOnly: true, cachePath: filename + '-missing' }).get(), error => error.code === 'CRM_VIEW_UNAVAILABLE');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('portfolio API serves summary and account-scoped details without exposing other accounts or connection secrets', async () => {
  const store = createPortfolioStore({ uri: 'private-source', now, read: async () => ({ data: source(), database: 'test' }) });
  const app = express(); app.use('/portfolio', createPortfolioRouter(store));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ code: error.code }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/portfolio';
  try {
    const summary = await (await fetch(base)).json();
    assert.equal(summary.data.metrics.accounts, 2); assert.ok(!('details' in summary.data));
    const response = await fetch(base + '/accounts/A');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const detail = (await response.json()).data;
    assert.equal(detail.account.id, 'A'); assert.ok(detail.invoices.every(row => row.subscriptionId === 'S-A'));
    assert.equal((await fetch(base + '/accounts/missing')).status, 404);
    assert.equal((await fetch(base + '/accounts/__proto__')).status, 404);
    assert.ok(!JSON.stringify(detail).includes('private-source'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
