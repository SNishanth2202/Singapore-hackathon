import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { AppError } from '../utils/errors';
import { hash } from './importer';

// Exact normalized identities, never substring or LLM-based customer matching.
export const normalizeCustomerName = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  .replace(/(?:\s+(?:pte|pvt|private|ltd|limited|inc|incorporated|corp|corporation))+$/g, '').trim();
const name = z.string().min(1).refine(v => !!normalizeCustomerName(v), 'Customer name must contain an identity');
export const CustomerDatabaseSchema = z.object({
  schemaVersion: z.literal(1), isMock: z.literal(true), updatedAt: z.string().datetime(), description: z.string(),
  customers: z.array(z.object({ id: z.string().min(1), name, accountIds: z.array(z.string().min(1)),
    aliases: z.array(name), groupNames: z.array(name), status: z.enum(['active', 'former']).optional(), previousManagerId: z.string().optional(), departureNotes: z.string().optional(), basis: z.enum(['publicly_documented_relationship', 'synthetic_crm']),
    sourceUrl: z.string().url().refine(v => v.startsWith('https://')), sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), evidence: z.string().min(1),
  }).strict()),
}).strict().refine(db => new Set(db.customers.map(c => c.id)).size === db.customers.length, 'Duplicate customer IDs');
export type CustomerDatabase = z.infer<typeof CustomerDatabaseSchema>;
export interface CustomerIdentity { accountId: string; account: string; parent: string; }
export interface CustomerCheck {
  result: 'not_found_in_mock_customer_database' | 'former_mock_customer'; databaseVersion: string; databaseUpdatedAt: string;
  isMock: true; limitation: string;
}
export interface CustomerExclusion {
  opportunityId: string; accountId: string; account: string; customerIds: string[];
  matchedBy: ('account_id' | 'name_or_alias' | 'explicit_group')[];
  sourceUrls: string[]; reason: 'known_singtel_relationship';
}
export interface CustomerEligibility {
  policy: 'exclude_known_singtel_customers'; isMock: true; databaseVersion: string;
  databaseUpdatedAt: string; evaluatedAsOf: string; excluded: CustomerExclusion[]; limitation: string;
}
export const CUSTOMER_CHECK_LIMITATION = 'Not found in the mock customer database; real non-customer status requires Singtel CRM verification.';
export function readCustomerDatabase(location = process.env.SINGTEL_CUSTOMER_DB_PATH || path.join(__dirname, '../fixtures/lead-ranking/singtel-customers.json')): CustomerDatabase {
  try {
    return CustomerDatabaseSchema.parse(JSON.parse(fs.readFileSync(location, 'utf8')));
  } catch { throw new AppError('The Singtel customer database is unavailable or invalid. Ranking is paused until customer eligibility can be checked.', 503, 'CUSTOMER_DATABASE_UNAVAILABLE'); }
}
export function checkCustomer(identity: CustomerIdentity, database: CustomerDatabase, status: 'active' | 'former' = 'active') {
  return database.customers.flatMap(customer => {
    if ((customer.status || 'active') !== status) return [];
    const matchedBy: CustomerExclusion['matchedBy'] = [];
    if (customer.accountIds.includes(identity.accountId)) matchedBy.push('account_id');
    if ([customer.name, ...customer.aliases].some(n => normalizeCustomerName(n) === normalizeCustomerName(identity.account))) matchedBy.push('name_or_alias');
    // Only explicit group-wide records match the parent. A shared ministry name is insufficient.
    if (customer.groupNames.some(n => [identity.account, identity.parent].some(v => normalizeCustomerName(n) === normalizeCustomerName(v)))) matchedBy.push('explicit_group');
    return matchedBy.length ? [{ customer, matchedBy }] : [];
  });
}
export function customerEligibility(candidates: (CustomerIdentity & { id: string })[], database: CustomerDatabase, evaluatedAsOf: string) {
  const version = hash(database), excluded: CustomerExclusion[] = [];
  for (const candidate of candidates) {
    const matches = checkCustomer(candidate, database);
    if (matches.length) excluded.push({ opportunityId: candidate.id, accountId: candidate.accountId, account: candidate.account,
      customerIds: matches.map(m => m.customer.id), matchedBy: [...new Set(matches.flatMap(m => m.matchedBy))],
      sourceUrls: [...new Set(matches.map(m => m.customer.sourceUrl))], reason: 'known_singtel_relationship' });
  }
  return { policy: 'exclude_known_singtel_customers', isMock: true, databaseVersion: version,
    databaseUpdatedAt: database.updatedAt, evaluatedAsOf, excluded, limitation: CUSTOMER_CHECK_LIMITATION } as CustomerEligibility;
}
