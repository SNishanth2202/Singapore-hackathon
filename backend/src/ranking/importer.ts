import { createHash } from 'crypto';
import { Evidence, SourceRecord, SourceSchema } from './contracts';

export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function importSources(existing: SourceRecord[], incoming: unknown[]) {
  const staged = incoming.map(value => SourceSchema.parse(value));
  for (const row of staged) {
    if (row.sourceFamily === 'gebiz_award') {
      for (const key of ['tenderNumber', 'buyer', 'supplier', 'awardDate', 'awardAmountSgd']) {
        if (row.claims[key] === undefined) throw new Error(`Missing award field ${key}`);
      }
      if (typeof row.claims.awardAmountSgd !== 'number' || !Number.isFinite(row.claims.awardAmountSgd)) throw new Error('Invalid award amount');
      if (row.claims.expiresAt || row.claims.noticeDueAt) throw new Error('Award records cannot establish expiry or notice dates');
    }
  }
  const records = new Map(existing.map(r => [r.id, r]));
  const fingerprints = new Set(existing.map(r => `${r.provenanceGroupId || r.sourceUrl}:${r.contentHash}`));
  let added = 0, duplicates = 0;
  for (const row of staged) {
    const key = `${row.provenanceGroupId || row.sourceUrl}:${row.contentHash}`;
    if (records.get(row.id)?.contentHash === row.contentHash || fingerprints.has(key)) { duplicates++; continue; }
    records.set(row.id, row); fingerprints.add(key); added++;
  }
  return { records: [...records.values()], added, duplicates };
}
export function sourceEvidence(row: SourceRecord): Evidence {
  return { id: row.id, title: row.sourceFamily === 'gebiz_award' ? `GeBIZ award · ${row.claims.tenderNumber}` : `${row.sourceFamily.toUpperCase()} · ${row.entityHints[0]?.name || 'Source observation'}`,
    origin: 'public', date: row.publishedAt || row.effectiveAt || row.retrievedAt,
    excerpt: row.excerpt, url: row.sourceUrl, locator: row.locator, claimStatus: row.claimStatus,
    entity: row.entityHints.map(h => h.name).join(' / '), site: String(row.claims.site || row.claims.newSite || 'Context only; exact site match requires review'), sourceFamily: row.sourceFamily };
}
export function matchEntity(name: string, accounts: { Id: string; Name: string }[]) {
  const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidates = accounts.filter(a => normalized(a.Name) === normalized(name));
  return { status: candidates.length === 1 ? 'verified' : candidates.length > 1 ? 'ambiguous' : 'unmatched', candidates: candidates.map(a => a.Id) };
}
export async function fetchGebiz(fetchImpl: typeof fetch = fetch): Promise<SourceRecord[]> {
  const rows: SourceRecord[] = [], seen = new Set<string>();
  let offset = 0, total: number | undefined;
  for (let page = 0; page < 10; page++) {
    const url = `https://data.gov.sg/api/action/datastore_search?resource_id=d_acde1106003906a75c3fa052592f2fcb&q=telecommunication&limit=5&offset=${offset}`;
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
      if (response.ok || (response.status !== 429 && response.status < 500) || attempt === 2) break;
      const delay = Math.min(2000, Number(response.headers?.get('retry-after') || 0.2 * 2 ** attempt) * 1000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    if (!response?.ok) throw new Error(`GeBIZ HTTP ${response?.status}`);
    const data = await response.json() as { success: boolean; result: { resource_id: string; total: number; records: Record<string, unknown>[] } };
    const result = data.result;
    if (!data.success || !result || result.resource_id !== 'd_acde1106003906a75c3fa052592f2fcb' || !Array.isArray(result.records) || !Number.isInteger(result.total)) throw new Error('GeBIZ schema drift');
    if (total !== undefined && result.total !== total) throw new Error('GeBIZ changed during pagination');
    total = result.total;
    for (const raw of result.records) {
      const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw.award_date));
      if (!match) throw new Error('Invalid D/M/YYYY award date');
      const [, d, m, y] = match.map(Number), date = new Date(Date.UTC(y, m - 1, d));
      if (date.getUTCDate() !== d || date.getUTCMonth() !== m - 1 || date.getUTCFullYear() !== y) throw new Error('Invalid calendar award date');
      for (const key of ['tender_no', 'agency', 'supplier_name', 'tender_description', 'awarded_amt']) if (raw[key] === null || raw[key] === undefined) throw new Error(`GeBIZ missing ${key}`);
      if (!Number.isInteger(raw._id)) throw new Error('GeBIZ missing integer row ID');
      if (String(raw.awarded_amt).trim() === '' || !Number.isFinite(Number(raw.awarded_amt)) || Number(raw.awarded_amt) < 0) throw new Error('GeBIZ invalid award amount');
      const id = `gebiz:${raw.tender_no}:${raw._id}`;
      if (seen.has(id)) throw new Error('GeBIZ overlapping pages');
      seen.add(id);
      const claims = { tenderNumber: String(raw.tender_no), buyer: String(raw.agency), supplier: String(raw.supplier_name),
        awardDate: date.toISOString().slice(0, 10), awardAmountSgd: Number(raw.awarded_amt), awardStatus: String(raw.tender_detail_status) };
      rows.push(SourceSchema.parse({ schemaVersion: 1, id, sourceFamily: 'gebiz_award',
        sourceUrl: 'https://data.gov.sg/datasets/d_acde1106003906a75c3fa052592f2fcb/view', retrievalUrl: url,
        locator: `tender_no=${raw.tender_no};row_id=${raw._id}`, publishedAt: null, effectiveAt: claims.awardDate,
        retrievedAt: new Date().toISOString(), excerpt: String(raw.tender_description),
        entityHints: [{ name: String(raw.agency), role: 'buyer' }, { name: String(raw.supplier_name), role: 'supplier' }],
        matchedEntityId: null, matchedSiteId: null, matchStatus: 'unreviewed', claimStatus: 'observed', origin: 'public', claims, contentHash: hash(claims) }));
    }
    offset += result.records.length;
    if (offset > total) throw new Error('GeBIZ returned more rows than declared');
    if (offset === total) return importSources([], rows).records;
    if (!result.records.length) throw new Error('GeBIZ incomplete page');
  }
  throw new Error('GeBIZ page limit reached; partial results discarded');
}
