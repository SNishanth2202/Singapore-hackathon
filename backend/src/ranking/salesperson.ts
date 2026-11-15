import { QueueRow, QueueSnapshot } from './contracts';
import { checkCustomer, CustomerDatabase, normalizeCustomerName } from './customer-eligibility';

// Synthetic profiles and workload, not real staff or CRM data. Capacity is measured in lead slots.
export const SALESPERSONS = [
  { id: 'aisha', name: 'Aisha Tan', territories: ['singapore'], industries: ['manufacturing', 'technology'], products: ['private 5g', 'new-site connectivity'], leadTypes: ['new business', 'expansion'], capacity: 7, currentLoad: 1 },
  { id: 'daniel', name: 'Daniel Lim', territories: ['singapore'], industries: ['construction', 'logistics', 'aerospace'], products: ['managed wan renewal', 'new-site connectivity'], leadTypes: ['new business', 'renewal'], capacity: 7, currentLoad: 2 },
  { id: 'priya', name: 'Priya Nair', territories: ['singapore'], industries: ['public sector', 'technology'], products: ['managed wan renewal', 'private 5g'], leadTypes: ['new business', 'renewal'], capacity: 7, currentLoad: 1 },
] as const;
export type SalespersonId = typeof SALESPERSONS[number]['id'];
const industries: Record<string, string> = { 'ACC-1': 'manufacturing', 'ACC-2': 'manufacturing', 'ACC-3': 'manufacturing', 'ACC-4': 'manufacturing', 'ACC-5': 'construction', 'ACC-6': 'public sector', 'ACC-7': 'aerospace', 'ACC-8': 'public sector' };
const norm = (s: string) => s.toLowerCase().trim();
const has = (items: readonly string[], value: string) => items.some(item => value.includes(item));

/** A single deterministic allocation for the whole eligible pool, independent of ranking view. */
export function allocateLeads(rows: QueueRow[], database: CustomerDatabase) {
  const load = new Map<string, number>(SALESPERSONS.map(p => [p.id, p.currentLoad]));
  const result = new Map<string, { salespersonId: SalespersonId; former: boolean }>();
  const groups = new Map<string, QueueRow[]>();
  for (const row of rows) {
    const name = normalizeCustomerName(row.account);
    const matching = [...groups.entries()].filter(([, members]) => members.some(member =>
      (row.accountId && member.accountId === row.accountId) || (name && normalizeCustomerName(member.account) === name)));
    const key = matching[0]?.[0] || row.accountId || name;
    const members = matching.flatMap(([, existing]) => existing);
    for (const [oldKey] of matching) groups.delete(oldKey);
    groups.set(key, [...members, row]);
  }
  // Former customers are considered only after new prospects, including when capacity is limited.
  const ordered = [...groups.entries()].sort(([ak, a], [bk, b]) =>
    Number(checkCustomer(a[0], database, 'former').length > 0) - Number(checkCustomer(b[0], database, 'former').length > 0) || ak.localeCompare(bk));
  for (const [, group] of ordered) {
    const former = group.some(row => checkCustomer(row, database, 'former').length > 0);
    const candidates = SALESPERSONS.filter(p => p.capacity - load.get(p.id)! >= group.length).map(p => {
      const remaining = (p.capacity - load.get(p.id)!) / p.capacity;
      const fit = group.reduce((sum, row) => {
        const territory = norm(row.territory || (row.address.toLowerCase().includes('singapore') ? 'singapore' : ''));
        const industry = norm(row.industry || industries[row.accountId] || '');
        const type = norm(row.leadType || (row.product.toLowerCase().includes('renewal') ? 'renewal' : 'new business'));
        return sum + (territory && has(p.territories, territory) ? 3 : 0) + (industry && has(p.industries, industry) ? 3 : 0)
          + (has(p.products, norm(row.product)) ? 4 : 0) + (has(p.leadTypes, type) ? 2 : 0);
      }, 0) / group.length;
      // Available capacity dominates all specialisation signals combined.
      return { p, score: remaining * 100 + fit };
    }).sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
    const chosen = candidates[0]?.p;
    if (!chosen) continue; // Never exceed capacity; leave the group unassigned.
    load.set(chosen.id, load.get(chosen.id)! + group.length);
    for (const row of group) result.set(row.id, { salespersonId: chosen.id, former });
  }
  return result;
}
export function salespersonQueue(queue: QueueSnapshot, canonical: QueueSnapshot, database: CustomerDatabase, id: SalespersonId): QueueSnapshot {
  const person = SALESPERSONS.find(p => p.id === id)!;
  const assignments = allocateLeads(canonical.items, database);
  const items = queue.items.filter(row => assignments.get(row.id)?.salespersonId === id)
    .sort((a, b) => Number(assignments.get(a.id)?.former) - Number(assignments.get(b.id)?.former) || a.rank - b.rank)
    .map((row, index) => ({ ...row, rank: index + 1, previousRank: null, movement: 'NEW' as const, owner: person.name,
      ...(assignments.get(row.id)?.former ? { nextAction: `Former customer: review departure and contact the previous account manager before outreach. ${row.nextAction}` } : {}) }));
  return { ...queue, items, total: items.length };
}
