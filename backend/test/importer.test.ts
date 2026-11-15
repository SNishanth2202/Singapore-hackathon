import test from 'node:test';
import assert from 'node:assert/strict';
import { importSources, fetchGebiz, matchEntity } from '../src/ranking/importer';
import { readSources } from '../src/ranking/seed';
import { extractSource, validateExtraction } from '../src/ranking/extractor';

test('live and snapshot families pass the same importer and syndicated records do not accumulate points', () => {
  const sources = readSources(); assert.equal(sources.length, 22);
  const second = importSources(sources, sources); assert.equal(second.added, 0); assert.equal(second.duplicates, 22);
  const first = sources.find(s => s.id === 'S02')!;
  const mirror = { ...first, id: 'S02-jtc-copy', sourceUrl: 'https://www.jtc.gov.sg/example' };
  assert.equal(importSources(sources, [mirror]).added, 0);
  assert.equal(importSources(sources, [mirror]).records.length, 22);
  assert.throws(() => importSources(sources, [{ ...first, sourceUrl: 'javascript:alert(1)' }]));
});
test('name ambiguity never silently merges accounts', () => {
  const result = matchEntity('ETLA Limited', [{ Id: 'a', Name: 'ETLA Limited' }, { Id: 'b', Name: 'Etla Limited' }]);
  assert.equal(result.status, 'ambiguous'); assert.deepEqual(result.candidates, ['a', 'b']);
});
test('connector failure and schema drift return no partial successful generation', async () => {
  await assert.rejects(fetchGebiz(async () => ({ ok: true, status: 200, json: async () => ({ success: true, result: {} }) }) as unknown as Response), /schema drift/);
  await assert.rejects(fetchGebiz(async () => ({ ok: false, status: 400 }) as Response), /HTTP 400/);
});
test('offline extraction is honestly labelled and unsupported LLM spans are rejected', async () => {
  const source = readSources().find(s => s.id === 'S02')!;
  const result = await extractSource(source);
  assert.equal(result.mode, 'curated_snapshot'); assert.equal(result.model, null);
  assert.throws(() => validateExtraction({ facts: [{ claim: 'Unproven expiry', sourceId: source.id, excerpt: 'made up deadline' }], opportunities: [] }, source), /unsupported/);
  assert.throws(() => validateExtraction({ facts: [], opportunities: [], score: 99 }, source));
});
const rawAward = (id: number) => ({ _id: id, tender_no: `TEST${id}`, tender_description: 'Connectivity',
  agency: 'Synthetic agency', supplier_name: 'Synthetic supplier', award_date: '6/9/2021', awarded_amt: '123', tender_detail_status: 'Awarded to Suppliers' });
const pageResponse = (records: unknown[], total: number) => new Response(JSON.stringify({ success: true, result: {
  resource_id: 'd_acde1106003906a75c3fa052592f2fcb', records, total,
} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
test('integrated connector retries 429 but publishes only a complete valid result', async () => {
  let calls = 0;
  const rows = await fetchGebiz(async () => ++calls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '0' } }) : pageResponse([rawAward(1)], 1));
  assert.equal(calls, 2); assert.equal(rows.length, 1); assert.equal(rows[0].claims.awardDate, '2021-09-06');
});
test('integrated connector discards later-page failures, changing totals and malformed payloads', async () => {
  let calls = 0;
  await assert.rejects(fetchGebiz(async () => ++calls === 1 ? pageResponse([rawAward(1)], 2) : new Response('', { status: 400 })), /HTTP 400/);
  calls = 0;
  await assert.rejects(fetchGebiz(async () => pageResponse([rawAward(++calls)], calls === 1 ? 2 : 3)), /changed/);
  await assert.rejects(fetchGebiz(async () => new Response('not-json', { status: 200 })));
  await assert.rejects(fetchGebiz(async () => { throw new Error('Simulated timeout'); }), /timeout/);
});
