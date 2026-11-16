import test from 'node:test';
import assert from 'node:assert/strict';
import { DATASET_ID, fetchGebiz, normalizeAward, parseAwardDate } from './gebiz-connector.mjs';

const raw = id => ({ _id: id, tender_no: `DEMO${id}`, tender_description: 'Connectivity',
  agency: 'Synthetic test agency', award_date: '6/9/2021',
  tender_detail_status: 'Awarded to Suppliers', supplier_name: 'Synthetic supplier', awarded_amt: '123.45' });
const response = (records, total) => ({ ok: true, status: 200,
  json: async () => ({ success: true, result: { resource_id: DATASET_ID, records, total } }) });

test('award dates use D/M/YYYY and reject invalid calendar values', () => {
  assert.equal(parseAwardDate('6/9/2021'), '2021-09-06');
  assert.equal(parseAwardDate('29/2/2024'), '2024-02-29');
  assert.throws(() => parseAwardDate('29/2/2023'));
  assert.throws(() => parseAwardDate('2024-03-04'));
});

test('normalization preserves provenance without inventing expiry or opportunity value', () => {
  const row = normalizeAward(raw(1), '2026-11-15T01:00:00Z', 'https://data.gov.sg/example');
  assert.equal(row.claims.awardAmountSgd, 123.45);
  assert.equal(row.claims.awardDate, '2021-09-06');
  assert.equal(row.matchedEntityId, null);
  assert.equal(row.claimStatus, 'observed');
  assert.equal(row.claims.expiresAt, undefined);
  assert.equal(row.claims.annualContributionSgd, undefined);
  assert.throws(() => normalizeAward({ ...raw(1), awarded_amt: 'unknown' }, '2026-11-15', 'x'));
  assert.throws(() => normalizeAward({ ...raw(1), supplier_name: null }, '2026-11-15', 'x'));
});

test('all pages are collected with stable record IDs and hashes on repeated reads', async () => {
  const fetchImpl = async url => {
    const offset = Number(url.searchParams.get('offset'));
    return response(offset === 0 ? [raw(1), raw(2)] : [raw(3)], 3);
  };
  const options = { pageSize: 2, fetchImpl, retrievedAt: '2026-11-15T01:00:00Z' };
  const first = await fetchGebiz(options), second = await fetchGebiz(options);
  assert.equal(first.complete, true);
  assert.equal(first.requests.length, 2);
  assert.equal(first.records.length, 3);
  assert.deepEqual(first, second);
});

test('missing or non-numeric amounts cannot become observed zero-value awards', () => {
  for (const awarded_amt of ['', ' ', false, []]) {
    assert.throws(() => normalizeAward({ ...raw(1), awarded_amt }, '2026-11-15', 'x'), /award amount/);
  }
  for (const awarded_amt of [0, '0']) {
    assert.equal(normalizeAward({ ...raw(1), awarded_amt }, '2026-11-15', 'x').claims.awardAmountSgd, 0);
  }
});

test('records exceeding the declared total cannot be published as a complete dataset', async () => {
  await assert.rejects(fetchGebiz({ fetchImpl: async () => response([raw(1), raw(2)], 1) }), /declared total/);
});

test('a later-page source failure rejects the generation rather than publishing partial records', async () => {
  const fetchImpl = async url => Number(url.searchParams.get('offset')) === 0
    ? response([raw(1)], 2) : { ok: false, status: 429 };
  await assert.rejects(fetchGebiz({ fetchImpl, pageSize: 1 }), /HTTP 429/);
});

test('schema drift, changed page totals and overlapping pages fail explicitly', async () => {
  await assert.rejects(fetchGebiz({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) }), /schema/);
  await assert.rejects(fetchGebiz({ pageSize: 1, fetchImpl: async url =>
    response([raw(Number(url.searchParams.get('offset')) + 1)], Number(url.searchParams.get('offset')) === 0 ? 2 : 3) }), /changed/);
  await assert.rejects(fetchGebiz({ pageSize: 1, fetchImpl: async () => response([raw(1)], 2) }), /Overlapping/);
});

test('initialized empty and page-limit exhaustion are different outcomes', async () => {
  const empty = await fetchGebiz({ fetchImpl: async () => response([], 0) });
  assert.deepEqual(empty.records, []);
  assert.equal(empty.complete, true);
  await assert.rejects(fetchGebiz({ maxPages: 1, pageSize: 1, fetchImpl: async () => response([raw(1)], 2) }), /partial result/);
});
