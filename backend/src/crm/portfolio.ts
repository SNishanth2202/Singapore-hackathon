import { AppError } from '../utils/errors';

export const CRM_SOURCE_COLLECTIONS = ['customers', 'subscriptions', 'usage_records', 'invoices', 'network_performance', 'interactions', 'sales_opportunities', 'customer_signals', 'account_relationships', 'account_priorities', 'solution_cases'] as const;
export type SourceRow = Record<string, unknown>;
export type CrmSourceData = Record<typeof CRM_SOURCE_COLLECTIONS[number], SourceRow[]>;
export interface AccountAction {
  id: string; kind: 'service' | 'capacity' | 'optimisation' | 'engagement' | 'contract' | 'pipeline' | 'payment';
  title: string; reason: string; nextStep: string; priority: 'high' | 'medium' | 'normal'; recordIds: string[];
}
export interface PortfolioAccount {
  id: string; name: string; industry: string; country: string; owner: string; tier: string;
  billedSgd: number; baseFeesSgd: number; openAnnualSgd: number; openOpportunities: number;
  subscriptionCount: number; capacityCount: number; optimisationCount: number; serviceReview: boolean;
  flaggedBreaches: number; latestSentiment: string | null; satisfaction: number | null;
  lastInteraction: string | null; contractReviews: number; primaryAction: AccountAction | null;
}
export interface PortfolioDetail {
  account: PortfolioAccount; actions: AccountAction[];
  subscriptions: { id: string; service: string; plan: string; ends: string; status: string; recordedStatus: string; baseFeeSgd: number; includedGb: number; usedGb: number | null; utilisationPct: number | null; siteCount: number; autoRenewal: boolean }[];
  invoices: { id: string; subscriptionId: string; period: string; totalSgd: number; status: string; paymentDate: string | null }[];
  opportunities: { id: string; name: string; type: string; product: string; stage: string; status: string; annualSgd: number; probabilityPct: number; expectedClose: string; needsReview: boolean }[];
  interactions: { id: string; date: string; type: string; sentiment: string; satisfaction: number; topics: string[]; followupRequired: boolean }[];
  network: { id: string; service: string; availabilityPct: number; targetPct: number; flaggedBreach: boolean; belowTarget: boolean; flagMismatch: boolean }[];
  relationships: { id: string; accountId: string; name: string; type: string; direction: 'parent' | 'child'; recordedStatus: string }[];
  billingHistory: { period: string; billedSgd: number }[];
  provenance: { datasetTags: string[]; operationalDataType: string; identityOrigin: string; referenceIds: string[] };
}
export interface CrmPortfolioSnapshot {
  schemaVersion: 1; refreshedAt: string; evaluatedOn: string; reportingMonth: string;
  coverage: { from: string; through: string; months: number };
  source: { database: string; collectionCounts: Record<string, number>; totalRecords: number; datasetTags: string[]; operationalDataTypes: string[] };
  metrics: { accounts: number; billedSgd: number; billedSubscriptions: number; openOpportunities: number; openAnnualSgd: number; weightedOpenAnnualSgd: number; capacitySubscriptions: number; capacityAccounts: number; optimisationSubscriptions: number; serviceReviewAccounts: number; flaggedBreachAccounts: number; contractReviews: number; staleOpportunities: number; latestNegativeAccounts: number; billingChangePct: number | null };
  billingTrend: { period: string; billedSgd: number; subscriptions: number }[];
  pipeline: { type: string; count: number; annualSgd: number }[];
  serviceMix: { service: string; subscriptions: number; baseFeesSgd: number }[];
  quality: { availabilityFlagMismatches: number; overdueWithPaymentDate: number; missingInvoiceDueDates: number; duplicateIds: number; orphanReferences: number };
  accounts: PortfolioAccount[]; details: Record<string, PortfolioDetail>;
}
const text = (row: SourceRow, field: string): string => row[field] instanceof Date ? (row[field] as Date).toISOString() : typeof row[field] === 'string' ? row[field] as string : '';
const number = (row: SourceRow, field: string): number => typeof row[field] === 'number' && Number.isFinite(row[field]) ? row[field] as number : 0;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (rows: SourceRow[], field: string) => round(rows.reduce((value, row) => value + number(row, field), 0));
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const byCustomer = (rows: SourceRow[]) => {
  const grouped = new Map<string, SourceRow[]>();
  for (const row of rows) { const id = text(row, 'customer_id'); const list = grouped.get(id) ?? []; list.push(row); grouped.set(id, list); }
  return grouped;
};
const priorityOrder = { high: 0, medium: 1, normal: 2 };

/** Facts and commercial arithmetic stay deterministic; original source labels remain in provenance. */
export function buildCrmPortfolio(data: CrmSourceData, options: { now?: Date; database?: string } = {}): CrmPortfolioSnapshot {
  const now = options.now ?? new Date();
  const sourceIds: Record<string, string> = { customers: 'customer_id', subscriptions: 'subscription_id', usage_records: 'usage_id', invoices: 'invoice_id', network_performance: 'record_id', interactions: 'interaction_id', sales_opportunities: 'opportunity_id', customer_signals: 'signal_id', account_relationships: 'relationship_id', account_priorities: 'customer_id', solution_cases: 'case_id' };
  for (const collection of CRM_SOURCE_COLLECTIONS) {
    if (!Array.isArray(data[collection])) throw new AppError('CRM source records are incomplete.', 503, 'CRM_SOURCE_INVALID');
    const seen = new Set<string>();
    for (const row of data[collection]) {
      const id = text(row, sourceIds[collection]);
      if (!id || seen.has(id)) throw new AppError('CRM source identifiers need review.', 503, 'CRM_SOURCE_INVALID');
      seen.add(id);
    }
  }
  const customers = new Map(data.customers.map(row => [text(row, 'customer_id'), row]));
  const subscriptions = new Map(data.subscriptions.map(row => [text(row, 'subscription_id'), row]));
  for (const collection of CRM_SOURCE_COLLECTIONS) for (const row of data[collection]) {
    const customerId = text(row, 'customer_id'), subscriptionId = text(row, 'subscription_id');
    if ((customerId && !customers.has(customerId)) || (subscriptionId && collection !== 'subscriptions' && (!subscriptions.has(subscriptionId) || text(subscriptions.get(subscriptionId)!, 'customer_id') !== customerId))) throw new AppError('CRM account references need review.', 503, 'CRM_SOURCE_INVALID');
    if (collection === 'account_relationships' && (!customers.has(text(row, 'parent_customer_id')) || !customers.has(text(row, 'child_customer_id')))) throw new AppError('CRM relationship endpoints need review.', 503, 'CRM_SOURCE_INVALID');
  }
  const numericFields: Partial<Record<typeof CRM_SOURCE_COLLECTIONS[number], string[]>> = {
    subscriptions: ['included_data_gb', 'monthly_base_fee_sgd'], invoices: ['total_amount_sgd', 'base_charge_sgd'], usage_records: ['data_usage_gb'], network_performance: ['availability_percentage', 'sla_target_percentage'], sales_opportunities: ['estimated_annual_value_sgd', 'probability_pct'], interactions: ['satisfaction_score'],
  };
  for (const [collection, fields] of Object.entries(numericFields)) for (const row of data[collection as keyof CrmSourceData]) for (const field of fields) {
    if (typeof row[field] !== 'number' || !Number.isFinite(row[field]) || number(row, field) < 0) throw new AppError('CRM numeric fields need review.', 503, 'CRM_SOURCE_INVALID');
    if (field === 'probability_pct' && number(row, field) > 100) throw new AppError('CRM probabilities need review.', 503, 'CRM_SOURCE_INVALID');
  }
  const periods = unique([...data.invoices.map(row => text(row, 'billing_period')), ...data.usage_records.map(row => text(row, 'period')), ...data.network_performance.map(row => text(row, 'period'))]).filter(value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)).sort();
  if (!customers.size || !periods.length) throw new AppError('CRM source has no reportable account history.', 503, 'CRM_SOURCE_EMPTY');
  const month = periods[periods.length - 1], today = now.toISOString();
  const latestInvoices = data.invoices.filter(row => text(row, 'billing_period') === month);
  const latestUsage = data.usage_records.filter(row => text(row, 'period') === month);
  const latestNetwork = data.network_performance.filter(row => text(row, 'period') === month);
  const usageBySubscription = new Map<string, SourceRow[]>();
  for (const row of latestUsage) { const id = text(row, 'subscription_id'); const list = usageBySubscription.get(id) ?? []; list.push(row); usageBySubscription.set(id, list); }
  const groups = Object.fromEntries(CRM_SOURCE_COLLECTIONS.filter(name => name !== 'account_relationships').map(name => [name, byCustomer(data[name])]));
  const billedSubscriptionIds = new Set(latestInvoices.map(row => text(row, 'subscription_id')));
  const open = data.sales_opportunities.filter(row => text(row, 'status') === 'Open');
  const stale = (row: SourceRow) => !!text(row, 'expected_close_date') && text(row, 'expected_close_date') < today;
  const collectionCounts = Object.fromEntries(CRM_SOURCE_COLLECTIONS.map(name => [name, data[name].length]));
  const details: Record<string, PortfolioDetail> = Object.create(null);
  const serviceMix = new Map<string, { service: string; subscriptions: number; baseFeesSgd: number }>();
  for (const [id, customer] of customers) {
    const rows = (collection: string) => groups[collection]?.get(id) ?? [];
    const invoices = latestInvoices.filter(row => text(row, 'customer_id') === id);
    const network = latestNetwork.filter(row => text(row, 'customer_id') === id).map(row => ({ id: text(row, 'record_id'), service: text(row, 'service_type'), availabilityPct: number(row, 'availability_percentage'), targetPct: number(row, 'sla_target_percentage'), flaggedBreach: row.sla_breached === true, belowTarget: number(row, 'availability_percentage') < number(row, 'sla_target_percentage'), flagMismatch: (row.sla_breached === true) !== (number(row, 'availability_percentage') < number(row, 'sla_target_percentage')) }));
    const plans = rows('subscriptions').map(row => {
      const subscriptionId = text(row, 'subscription_id'), usage = usageBySubscription.get(subscriptionId), included = number(row, 'included_data_gb');
      const ends = text(row, 'contract_end'), recordedStatus = text(row, 'contract_status');
      const plan = { id: subscriptionId, service: text(row, 'service_category'), plan: text(row, 'plan_name'), ends, recordedStatus, status: recordedStatus === 'Active' && ends && ends < today ? 'Contract review' : recordedStatus === 'Active' ? 'Active' : 'Historical', baseFeeSgd: number(row, 'monthly_base_fee_sgd'), includedGb: included, usedGb: usage ? sum(usage, 'data_usage_gb') : null, utilisationPct: usage && included > 0 ? round(sum(usage, 'data_usage_gb') / included * 100) : null, siteCount: usage ? new Set(usage.map(item => text(item, 'site_id'))).size : 0, autoRenewal: row.auto_renewal === true };
      if (billedSubscriptionIds.has(subscriptionId)) { const mix = serviceMix.get(plan.service) ?? { service: plan.service, subscriptions: 0, baseFeesSgd: 0 }; mix.subscriptions++; mix.baseFeesSgd = round(mix.baseFeesSgd + plan.baseFeeSgd); serviceMix.set(plan.service, mix); }
      return plan;
    });
    const capacity = plans.filter(plan => plan.utilisationPct != null && plan.utilisationPct > 100), lowUsage = plans.filter(plan => plan.utilisationPct != null && plan.utilisationPct < 30);
    const interactions = rows('interactions').slice().sort((a, b) => text(b, 'interaction_date').localeCompare(text(a, 'interaction_date')) || text(a, 'interaction_id').localeCompare(text(b, 'interaction_id')));
    const latest = interactions[0];
    const opportunities = rows('sales_opportunities').filter(row => text(row, 'status') === 'Open');
    const contractReview = plans.filter(plan => plan.status === 'Contract review');
    const flagged = network.filter(row => row.flaggedBreach), below = network.filter(row => row.belowTarget), negative = latest && text(latest, 'sentiment') === 'Negative';
    const actions: AccountAction[] = [];
    const add = (action: Omit<AccountAction, 'id'>) => actions.push({ ...action, id: id + ':' + action.kind });
    if (flagged.length || below.length) add({ kind: 'service', title: 'Review service performance', reason: `${below.length} service record(s) below the recorded availability target; ${flagged.length} flagged for review in ${month}.`, nextStep: 'Confirm the applicable SLA and incident history with the service team before an expansion pitch.', priority: flagged.length ? 'high' : 'normal', recordIds: unique([...flagged, ...below].map(row => row.id)) });
    if (negative) add({ kind: 'engagement', title: 'Follow up on customer concerns', reason: `The latest interaction records negative sentiment and satisfaction ${number(latest!, 'satisfaction_score')}.`, nextStep: 'Review the conversation with the account owner and agree a recovery plan.', priority: 'high', recordIds: [text(latest!, 'interaction_id')] });
    if (capacity.length) add({ kind: 'capacity', title: 'Review capacity upgrade', reason: `${capacity.length} subscription(s) exceed their recorded data allowance in ${month}: ${unique(capacity.map(plan => plan.service)).join(', ')}.`, nextStep: flagged.length || negative ? 'Resolve customer concerns first, then validate usage and discuss the capacity requirement.' : 'Confirm the allowance scope and demand trend, then prepare a capacity-fit discussion.', priority: 'medium', recordIds: capacity.map(plan => plan.id) });
    if (contractReview.length) add({ kind: 'contract', title: 'Confirm contract and renewal status', reason: `${contractReview.length} subscription(s) are marked active with an end date before ${today.slice(0, 10)}.`, nextStep: 'Check for signed extensions or replacement contracts and update the account record.', priority: 'medium', recordIds: contractReview.map(plan => plan.id) });
    if (lowUsage.length) add({ kind: 'optimisation', title: 'Optimise underused plans', reason: `${lowUsage.length} subscription(s) are below 30% of their recorded data allowance in ${month}.`, nextStep: 'Check minimum commitments, shared allowances and future demand before proposing a plan change.', priority: 'normal', recordIds: lowUsage.map(plan => plan.id) });
    const staleDeals = opportunities.filter(stale);
    if (staleDeals.length) add({ kind: 'pipeline', title: 'Refresh open sales opportunities', reason: `${staleDeals.length} open opportunity record(s) have passed their expected close date.`, nextStep: 'Confirm the buying window, stage and next meeting with the account owner.', priority: 'normal', recordIds: staleDeals.map(row => text(row, 'opportunity_id')) });
    const overdue = invoices.filter(row => text(row, 'payment_status') === 'Overdue');
    if (overdue.length) add({ kind: 'payment', title: 'Reconcile invoice status', reason: `${overdue.length} invoice(s) in ${month} are marked overdue.`, nextStep: 'Ask finance to verify payment dates, due dates and outstanding balances before contacting the customer.', priority: 'normal', recordIds: overdue.map(row => text(row, 'invoice_id')) });
    actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    const account: PortfolioAccount = { id, name: text(customer, 'company_name'), industry: text(customer, 'industry'), country: text(customer, 'country'), owner: text(customer, 'account_manager_id'), tier: text(customer, 'strategic_tier'), billedSgd: sum(invoices, 'total_amount_sgd'), baseFeesSgd: sum(invoices, 'base_charge_sgd'), openAnnualSgd: sum(opportunities, 'estimated_annual_value_sgd'), openOpportunities: opportunities.length, subscriptionCount: new Set(invoices.map(row => text(row, 'subscription_id'))).size, capacityCount: capacity.length, optimisationCount: lowUsage.length, serviceReview: below.length > 0 || flagged.length > 0, flaggedBreaches: flagged.length, latestSentiment: latest ? text(latest, 'sentiment') : null, satisfaction: latest ? number(latest, 'satisfaction_score') : null, lastInteraction: latest ? text(latest, 'interaction_date') : null, contractReviews: contractReview.length, primaryAction: actions[0] ?? null };
    details[id] = { account, actions, subscriptions: plans.sort((a, b) => Number(b.utilisationPct != null) - Number(a.utilisationPct != null) || a.id.localeCompare(b.id)), invoices: invoices.map(row => ({ id: text(row, 'invoice_id'), subscriptionId: text(row, 'subscription_id'), period: text(row, 'billing_period'), totalSgd: number(row, 'total_amount_sgd'), status: text(row, 'payment_status'), paymentDate: text(row, 'payment_date') || null })), opportunities: rows('sales_opportunities').map(row => ({ id: text(row, 'opportunity_id'), name: text(row, 'opportunity_name'), type: text(row, 'opportunity_type'), product: text(row, 'product_category'), stage: text(row, 'stage'), status: text(row, 'status'), annualSgd: number(row, 'estimated_annual_value_sgd'), probabilityPct: number(row, 'probability_pct'), expectedClose: text(row, 'expected_close_date'), needsReview: text(row, 'status') === 'Open' && stale(row) })), interactions: interactions.slice(0, 8).map(row => ({ id: text(row, 'interaction_id'), date: text(row, 'interaction_date'), type: text(row, 'interaction_type'), sentiment: text(row, 'sentiment'), satisfaction: number(row, 'satisfaction_score'), topics: Array.isArray(row.discussion_topics) ? row.discussion_topics.filter((value): value is string => typeof value === 'string') : [], followupRequired: row.follow_up_required === true })), network, relationships: data.account_relationships.filter(row => text(row, 'parent_customer_id') === id || text(row, 'child_customer_id') === id).map(row => { const parent = text(row, 'parent_customer_id') === id, other = text(row, parent ? 'child_customer_id' : 'parent_customer_id'); return { id: text(row, 'relationship_id'), accountId: other, name: text(customers.get(other)!, 'company_name'), type: text(row, 'relationship_type'), direction: parent ? 'child' as const : 'parent' as const, recordedStatus: text(row, 'relationship_status') }; }), billingHistory: periods.map(period => ({ period, billedSgd: sum(rows('invoices').filter(row => text(row, 'billing_period') === period), 'total_amount_sgd') })), provenance: { datasetTags: unique(rows('subscriptions').map(row => text(row, 'dataset_tag'))), operationalDataType: text(customer, 'operational_data_type'), identityOrigin: text(customer, 'data_origin'), referenceIds: [id] } };
  }
  const accounts = Object.values(details).map(detail => detail.account).sort((a, b) => (a.primaryAction ? priorityOrder[a.primaryAction.priority] : 3) - (b.primaryAction ? priorityOrder[b.primaryAction.priority] : 3) || b.billedSgd - a.billedSgd || a.id.localeCompare(b.id));
  const billingTrend = periods.map(period => { const invoices = data.invoices.filter(row => text(row, 'billing_period') === period); return { period, billedSgd: sum(invoices, 'total_amount_sgd'), subscriptions: new Set(invoices.map(row => text(row, 'subscription_id'))).size }; });
  const priorYear = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`, priorBilled = billingTrend.find(row => row.period === priorYear)?.billedSgd;
  const billedSgd = sum(latestInvoices, 'total_amount_sgd');
  return { schemaVersion: 1, refreshedAt: today, evaluatedOn: today.slice(0, 10), reportingMonth: month, coverage: { from: periods[0], through: month, months: periods.length }, source: { database: options.database ?? 'test', collectionCounts, totalRecords: Object.values(collectionCounts).reduce((a, b) => a + b, 0), datasetTags: unique(data.customers.map(row => text(row, 'dataset_tag'))), operationalDataTypes: unique(data.customers.map(row => text(row, 'operational_data_type'))) }, metrics: { accounts: accounts.length, billedSgd, billedSubscriptions: billedSubscriptionIds.size, openOpportunities: open.length, openAnnualSgd: sum(open, 'estimated_annual_value_sgd'), weightedOpenAnnualSgd: round(open.reduce((value, row) => value + number(row, 'estimated_annual_value_sgd') * number(row, 'probability_pct') / 100, 0)), capacitySubscriptions: accounts.reduce((value, row) => value + row.capacityCount, 0), capacityAccounts: accounts.filter(row => row.capacityCount > 0).length, optimisationSubscriptions: accounts.reduce((value, row) => value + row.optimisationCount, 0), serviceReviewAccounts: accounts.filter(row => row.serviceReview).length, flaggedBreachAccounts: accounts.filter(row => row.flaggedBreaches > 0).length, contractReviews: accounts.reduce((value, row) => value + row.contractReviews, 0), staleOpportunities: open.filter(stale).length, latestNegativeAccounts: accounts.filter(row => row.latestSentiment === 'Negative').length, billingChangePct: priorBilled ? round((billedSgd / priorBilled - 1) * 100) : null }, billingTrend, pipeline: unique(open.map(row => text(row, 'opportunity_type'))).map(type => { const rows = open.filter(row => text(row, 'opportunity_type') === type); return { type, count: rows.length, annualSgd: sum(rows, 'estimated_annual_value_sgd') }; }), serviceMix: [...serviceMix.values()].sort((a, b) => b.subscriptions - a.subscriptions || a.service.localeCompare(b.service)), quality: { availabilityFlagMismatches: data.network_performance.filter(row => (row.sla_breached === true) !== (number(row, 'availability_percentage') < number(row, 'sla_target_percentage'))).length, overdueWithPaymentDate: data.invoices.filter(row => text(row, 'payment_status') === 'Overdue' && !!text(row, 'payment_date')).length, missingInvoiceDueDates: data.invoices.filter(row => !row.due_date).length, duplicateIds: 0, orphanReferences: 0 }, accounts, details };
}
