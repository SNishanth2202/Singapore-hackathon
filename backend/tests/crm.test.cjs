process.env.STORAGE_MODE = 'memory';
process.env.NODE_ENV = 'test';
process.env.LOCAL_DEMO_MODE = 'true';
for (const key of ['AI_API_KEY', 'FREELLMAPI_API_KEY', 'OPENAI_API_KEY']) process.env[key] = '';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { buildCrmSeedDocuments, validateStoredCrmDataset, artifactContentHash } = require('../dist/crm/dataset');
const { createCrmService, projectCrmAccount } = require('../dist/crm/service');
const { createCrmRouter } = require('../dist/crm/routes');
const { crmSeedDecision } = require('../dist/crm/store');
const { artifacts: originalArtifacts } = require('../dist/customer-graph/fixtures');
const { CrmAccount, CrmArtifact, CrmExtraction, CrmDataset } = require('../dist/models/Crm');
const { AppError } = require('../dist/utils/errors');

test('CRM import exports stable schema-valid documents for only the existing 2 accounts and 18 original artifacts', () => {
  const data = buildCrmSeedDocuments(), repeated = buildCrmSeedDocuments();
  assert.deepEqual(data, repeated);
  assert.equal(data.accounts.length, 2);
  assert.equal(data.artifacts.length, 18);
  assert.deepEqual(data.accounts.map(row => row._id), ['demo:customer:meridian', 'demo:customer:harbour']);
  assert.ok(data.accounts.every(row => !row._id.startsWith('synthetic:showcase-')));
  assert.equal(data.collections.crm_datasets.length, 1);
  for (const [Model, documents] of [[CrmAccount, data.accounts], [CrmArtifact, data.artifacts], [CrmExtraction, data.extractions], [CrmDataset, data.datasets]]) {
    for (const document of documents) assert.equal(new Model(document).validateSync(), undefined);
  }
  for (const document of data.artifacts) {
    const original = originalArtifacts.find(row => row.id === document.sourceArtifactId);
    assert.deepEqual(document.record, original);
    assert.equal(document.contentHash, artifactContentHash(original.content));
  }
});

test('CRM details preserve original contract dates, source passages and prerequisite risks', () => {
  const data = buildCrmSeedDocuments(), detail = projectCrmAccount(data, 'demo:customer:meridian', { mode: 'cloud', durable: true });
  assert.equal(detail.account.externalAccountId, 'ACC-ML-001');
  assert.equal(detail.account.relationshipStatus, 'EXISTING_CUSTOMER');
  assert.ok(detail.contracts.length > 0 && detail.invoices.length > 0 && detail.usage.length > 0 && detail.support.length > 0);
  assert.ok(detail.contacts.some(row => row.name === 'Maya Tan'));
  for (const fact of detail.facts) for (const reference of fact.evidence) {
    const artifact = detail.artifacts.find(row => row.id === reference.artifactId);
    assert.ok(artifact.content.includes(reference.quote));
  }
  const contractText = detail.contracts.flatMap(row => row.facts).map(row => row.statement + ' ' + row.value + ' ' + row.date).join(' ');
  assert.ok(contractText.includes('31 January 2027'), 'executed contract date is retained in its original interpretation');
  assert.ok(contractText.includes('28 February 2027'), 'conflicting manually entered CRM date is retained');
  assert.ok(detail.support.some(row => /SUP-4821/.test(row.title) && row.facts.length > 0));
  assert.ok(detail.risks.length > 0);
  const blockerAction = detail.actions.find(row => row.id === 'idea-meridian-incident-review');
  assert.ok(blockerAction.factIds.includes('fact-meridian-expansion-blocker'));
  assert.ok(blockerAction.nextAction.includes('without presenting an upgrade as a confirmed fix'));
});

test('repeat imports preserve user fields and a newer active run while rejecting changed immutable payloads', () => {
  const data = buildCrmSeedDocuments(), saved = new Map();
  const rows = Object.values(data.collections).flat();
  for (const row of rows) {
    assert.equal(crmSeedDecision(row, null), 'insert');
    saved.set(row._id, { ...structuredClone(row), userNotes: 'Keep my account notes' });
  }
  const pointer = saved.get(data.datasets[0]._id);
  pointer.currentRunId = 'newer-accepted-run';
  for (const row of rows) assert.equal(crmSeedDecision(row, saved.get(row._id)), 'preserve');
  assert.equal(pointer.currentRunId, 'newer-accepted-run');
  assert.ok([...saved.values()].every(row => row.userNotes === 'Keep my account notes'));
  const tampered = structuredClone(data.artifacts[0]);
  tampered.record.content = 'Changed content with an unchanged claimed hash';
  assert.throws(() => crmSeedDecision(data.artifacts[0], tampered), error => error.code === 'CRM_SEED_CONFLICT');
  assert.equal(saved.size, rows.length);
});

test('changed source bytes, metadata, missing records and cross-account citations fail validation', () => {
  const original = buildCrmSeedDocuments();
  const corrupt = structuredClone(original);
  corrupt.artifacts[0].record.content += '\nAn unsupported new statement.';
  assert.throws(() => validateStoredCrmDataset(corrupt), error => error.code === 'CRM_DATASET_INVALID');
  const metadata = structuredClone(original);
  metadata.artifacts[0].record.source = 'billing';
  assert.throws(() => validateStoredCrmDataset(metadata), error => error.code === 'CRM_DATASET_INVALID');
  const missing = structuredClone(original);
  missing.artifacts.pop();
  assert.throws(() => validateStoredCrmDataset(missing), error => error.code === 'CRM_DATASET_INVALID');
  const crossAccount = structuredClone(original);
  crossAccount.artifacts[0].accountId = 'demo:customer:harbour';
  assert.throws(() => validateStoredCrmDataset(crossAccount), error => error.code === 'CRM_DATASET_INVALID');
  assert.throws(() => validateStoredCrmDataset({ ...original, datasets: [] }), error => error.code === 'CRM_IMPORT_REQUIRED');
});

test('account projections only include their own sources and distinguish temporary persistence', async () => {
  const data = buildCrmSeedDocuments();
  const service = createCrmService(async () => ({ data, persistence: { mode: 'memory', durable: false } }));
  const list = await service.list();
  assert.equal(list.accounts.length, 2);
  assert.equal(list.persistence.durable, false);
  for (const account of list.accounts) {
    const detail = await service.detail(account.id);
    assert.ok(detail.artifacts.every(row => row.accountId === account.graphAccountId));
    assert.equal(detail.account.counts.artifacts, detail.artifacts.length);
    assert.equal(detail.account.counts.facts, detail.facts.length);
    assert.ok(detail.account.isSynthetic);
  }
  await assert.rejects(service.detail('synthetic:showcase-meridian-logistics'), error => error.code === 'CRM_ACCOUNT_NOT_FOUND');
  const unavailable = createCrmService(async () => { throw new AppError('Atlas unavailable', 503, 'CLOUD_STORAGE_UNAVAILABLE'); });
  await assert.rejects(unavailable.list(), error => error.code === 'CLOUD_STORAGE_UNAVAILABLE', 'cloud errors never substitute fixture data');
});

let server, base;
before(async () => {
  const app = express();
  app.use('/crm', createCrmRouter());
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ success: false, code: error.code }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/crm';
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test('CRM API lists records and downloads exact source content without cross-account access', async () => {
  const response = await fetch(base + '/accounts'), list = await response.json();
  assert.equal(response.status, 200);
  assert.equal(list.success, true);
  assert.equal(list.data.accounts.length, 2);
  assert.equal(list.data.persistence.durable, false);
  const accountId = 'demo:customer:meridian';
  const detailResponse = await fetch(base + '/accounts/' + encodeURIComponent(accountId));
  const detail = (await detailResponse.json()).data;
  const artifact = detail.artifacts.find(row => row.id === 'ml-contract');
  assert.ok(artifact);
  const download = await fetch(base + '/accounts/' + encodeURIComponent(accountId) + '/artifacts/' + artifact.id);
  assert.equal(download.status, 200);
  assert.ok(download.headers.get('content-disposition').includes(artifact.filename));
  assert.equal(await download.text(), artifact.content);
  const wrong = await fetch(base + '/accounts/' + encodeURIComponent(accountId) + '/artifacts/hp-contract');
  assert.equal(wrong.status, 404);
  assert.equal((await wrong.json()).code, 'CRM_ARTIFACT_NOT_FOUND');
});
