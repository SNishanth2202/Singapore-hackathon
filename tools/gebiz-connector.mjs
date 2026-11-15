/** Read-only, dependency-free connector spike. Does not write to the app's databases. */
import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DATASET_ID = 'd_acde1106003906a75c3fa052592f2fcb';
export const DATASET_URL = `https://data.gov.sg/datasets/${DATASET_ID}/view`;
const ENDPOINT = 'https://data.gov.sg/api/action/datastore_search';
const REQUIRED = ['tender_no', 'tender_description', 'agency', 'award_date',
  'tender_detail_status', 'supplier_name', 'awarded_amt'];

export function parseAwardDate(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error(`Invalid D/M/YYYY award date: ${value}`);
  const [, day, month, year] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return date.toISOString().slice(0, 10);
}

export function normalizeAward(row, retrievedAt, requestUrl) {
  for (const field of REQUIRED) {
    if (row[field] === undefined || row[field] === null) throw new Error(`Missing field: ${field}`);
  }
  if (!Number.isInteger(row._id)) throw new Error('Missing integer source row ID');
  const amount = Number(row.awarded_amt);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid award amount');
  const id = `gebiz:${row.tender_no}:${row._id}`;
  return {
    schemaVersion: 1, id, sourceFamily: 'gebiz_award', sourceUrl: DATASET_URL,
    retrievalUrl: requestUrl, locator: `tender_no=${row.tender_no};row_id=${row._id}`,
    publishedAt: null, effectiveAt: parseAwardDate(row.award_date), retrievedAt,
    excerpt: row.tender_description,
    entityHints: [{ name: row.agency, role: 'buyer' }, { name: row.supplier_name, role: 'supplier' }],
    matchedEntityId: null, matchedSiteId: null, matchStatus: 'unreviewed',
    claimStatus: 'observed', origin: 'public',
    claims: {
      tenderNumber: row.tender_no, buyer: row.agency, supplier: row.supplier_name,
      awardDate: parseAwardDate(row.award_date), awardAmountSgd: amount,
      awardStatus: row.tender_detail_status,
    },
    // No expiry, notice date, installed service or opportunity value is inferred from an award.
    contentHash: createHash('sha256').update(JSON.stringify(REQUIRED.map(key => [key, row[key]]))).digest('hex'),
  };
}

export async function fetchGebiz({ query = 'telecommunication', pageSize = 5, maxPages = 10,
  fetchImpl = fetch, retrievedAt = new Date().toISOString() } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('pageSize must be 1..100');
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error('maxPages must be positive');
  const records = [], requests = [], seen = new Set();
  let offset = 0, expectedTotal;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(ENDPOINT);
    for (const [key, value] of Object.entries({ resource_id: DATASET_ID, q: query, limit: pageSize, offset })) {
      url.searchParams.set(key, String(value));
    }
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`GeBIZ HTTP ${response.status}`);
    const body = await response.json();
    const result = body.result;
    if (body.success !== true || !result || result.resource_id !== DATASET_ID || !Array.isArray(result.records)
        || !Number.isInteger(result.total) || result.total < 0) throw new Error('Unexpected GeBIZ response schema');
    if (expectedTotal !== undefined && result.total !== expectedTotal) throw new Error('Dataset changed during pagination; retry');
    expectedTotal = result.total;
    requests.push({ url: url.href, status: response.status, returned: result.records.length });
    for (const row of result.records) {
      const record = normalizeAward(row, retrievedAt, url.href);
      if (seen.has(record.id)) throw new Error(`Overlapping source pages: ${record.id}`);
      seen.add(record.id); records.push(record);
    }
    offset += result.records.length;
    if (offset >= expectedTotal) return {
      schemaVersion: 1, connector: 'gebiz-awards-spike-v1', retrievedAt, query,
      complete: true, sourceTotal: expectedTotal, requests, records,
    };
    if (result.records.length === 0) throw new Error('Empty page before declared total');
  }
  throw new Error(`Page limit exceeded; refusing to publish a partial result (${records.length}/${expectedTotal})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const output = process.argv[2];
    if (!output) throw new Error('Usage: node tools/gebiz-connector.mjs <output.json>');
    const result = await fetchGebiz();
    const target = resolve(output);
    await mkdir(dirname(target), { recursive: true });
    // Publish only a complete success; a fetch failure preserves any previous output.
    await writeFile(`${target}.tmp`, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    await rename(`${target}.tmp`, target);
    console.log(JSON.stringify({ output, records: result.records.length, pages: result.requests.length,
      complete: result.complete, retrievedAt: result.retrievedAt }));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
