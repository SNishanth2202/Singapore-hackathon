const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.STORAGE_MODE='memory';process.env.LOCAL_DEMO_MODE='true';process.env.NODE_ENV='test';
const {saveResearch,loadResearch,listResearch}=require('../dist/integrations/research/store');
const {saveAnalysis,latestAnalysis,loadAnalysis}=require('../dist/integrations/research/analysisStore');
const {researchGraphData}=require('../dist/integrations/neo4j/researchGraph');
const {retryDelay,syncNextResearch}=require('../dist/integrations/neo4j/syncWorker');

test('cloud startup installs the unique keys used for worker leases, settings, ranking and notifications', async t => {
  const mongoose = require('mongoose');
  const { ensureCloudIndexes } = require('../dist/models/CloudStorage');
  const { AiManagementCompany, AiManagementSettings, AiManagementNotification, DailyRankingRun, AiManagementLease } = require('../dist/models/AiManagement');
  const indexed = new Set();
  for (const model of Object.values(mongoose.models)) {
    t.mock.method(model, 'createCollection', async () => {});
    t.mock.method(model, 'createIndexes', async () => indexed.add(model.modelName));
  }
  await ensureCloudIndexes();
  for (const model of [AiManagementCompany, AiManagementSettings, AiManagementNotification, DailyRankingRun, AiManagementLease]) {
    assert.ok(indexed.has(model.modelName), model.modelName + ' indexes must exist before workers start');
  }
});
const record={id:'research-11111111-1111-4111-8111-111111111111',company:{entityId:'Q123',name:'Example Logistics',aliases:[],description:'Test fixture',website:null,identitySource:'https://example.com',wikipediaTitle:null},createdAt:new Date().toISOString(),warnings:[],sources:[{id:'e1',kind:'news_headline',title:'Example Logistics opens a warehouse',url:'https://example.com/news',publisher:'Example',excerpt:'Headline only',publishedAt:new Date().toISOString(),retrievedAt:new Date().toISOString(),contentHash:'abc',verification:'headline_only'},{id:'e2',kind:'news_headline',title:'Unrelated company launches a product',url:'https://example.com/other',publisher:'Example',excerpt:'Other company',publishedAt:new Date().toISOString(),retrievedAt:new Date().toISOString(),contentHash:'def',verification:'headline_only'}]};

test('history and saved reports retain the exact snapshot and clone returned values',async()=>{
  await saveResearch(structuredClone(record));
  const loaded=await loadResearch(record.id);loaded.company.name='changed';
  assert.equal((await loadResearch(record.id)).company.name,'Example Logistics');
  assert.equal((await listResearch())[0].id,record.id);
  const first=await saveAnalysis(record.id,{summary:'first',businessContext:{knowledgeVersion:1}});
  const second=await saveAnalysis(record.id,{summary:'second',businessContext:{knowledgeVersion:2}});
  assert.notEqual(first.analysisId,second.analysisId);
  assert.equal((await latestAnalysis(record.id)).result.summary,'second');
  assert.equal((await loadAnalysis(first.analysisId)).result.summary,'first');
  await assert.rejects(loadAnalysis('../secrets'),{code:'NOT_FOUND'});
});
test('graph scope keeps immutable evidence separate and does not turn unrelated headlines into company events',()=>{
  const a=researchGraphData(record),b=researchGraphData({...record,id:'research-22222222-2222-4222-8222-222222222222'});
  assert.equal(a.companyId,b.companyId);
  assert.notEqual(a.sources[0].id,b.sources[0].id);
  assert.equal(a.events.length,1);
  assert.equal(a.events[0].verification,'HEADLINE_ONLY');
  assert.deepEqual(a.events[0].sourceIds,[record.id+':e1']);
});
test('graph failures leave a leased snapshot pending for retry; success acknowledges only the same lease',async t=>{
  const {ResearchSnapshot}=require('../dist/models/CloudStorage');
  const projection=require('../dist/integrations/neo4j/researchGraph');
  const original={find:ResearchSnapshot.findOneAndUpdate,update:ResearchSnapshot.updateOne,project:projection.projectResearch};
  t.after(()=>{ResearchSnapshot.findOneAndUpdate=original.find;ResearchSnapshot.updateOne=original.update;projection.projectResearch=original.project;});
  let lease,update;
  ResearchSnapshot.findOneAndUpdate=(_filter,mutation)=>{lease=mutation.$set.graphLeaseToken;return {lean:async()=>({_id:record.id,record,graphAttempts:3})};};
  ResearchSnapshot.updateOne=async(filter,mutation)=>{assert.equal(filter.graphLeaseToken,lease);update=mutation;};
  projection.projectResearch=async()=>{throw new Error('network unavailable');};
  assert.equal(await syncNextResearch(),true);assert.equal(update.$set.graphStatus,'PENDING');
  assert.ok(update.$set.graphRetryAt>Date.now());
  projection.projectResearch=async()=>{};
  assert.equal(await syncNextResearch(),true);assert.equal(update.$set.graphStatus,'SYNCED');
  assert.ok(update.$set.graphSyncedAt instanceof Date);
  assert.equal(retryDelay(999),300000);
});

test('the fictional seed reuses existing company IDs and scopes insertions to its own records', async t => {
  const { seed } = require('../dist/scripts/seed');
  const { Company } = require('../dist/models/Company');
  const { IntelligenceSignal } = require('../dist/models/IntelligenceSignal');
  const { Opportunity } = require('../dist/models/Opportunity');
  const graph = require('../dist/integrations/neo4j/graphService');
  t.mock.method(require('../dist/integrations/mongodb/connection'), 'connectMongoDB', async () => {});
  t.mock.method(require('../dist/integrations/neo4j/connection'), 'connectNeo4j', async () => {});
  t.mock.method(graph, 'applyConstraints', async () => {});
  t.mock.method(graph, 'createCompanyNode', async () => {});
  const links = t.mock.method(graph, 'createRelationship', async () => {});
  t.mock.method(Company, 'findByIdAndUpdate', async () => {});
  for (const model of [Company, IntelligenceSignal, Opportunity]) {
    t.mock.method(model, 'deleteMany', () => assert.fail('Seeding cannot delete application data'));
  }
  const legacyId = '123456789012345678901234';
  const companies = t.mock.method(Company, 'findOneAndUpdate', async (filter, update) => {
    const row = update.$setOnInsert;
    assert.deepEqual(filter.$or, [{ _id: row._id }, {
      registrationNumber: row.registrationNumber, 'sourceReferences.sourceUrl': 'internal://seed',
    }]);
    const id = row.registrationNumber === 'SG-FAKE-202301001' ? legacyId : row._id;
    return { ...row, id, _id: id };
  });
  const signals = t.mock.method(IntelligenceSignal, 'updateOne', async () => {});
  const opportunities = t.mock.method(Opportunity, 'updateOne', async () => {});
  await seed();
  await seed();
  for (const writes of [companies, signals, opportunities]) {
    const insertedIds = writes.mock.calls.map(({ arguments: [, update] }) => update.$setOnInsert._id);
    assert.equal(insertedIds.length, 10);
    assert.equal(new Set(insertedIds).size, 5);
  }
  for (const writes of [signals, opportunities]) {
    assert.equal(writes.mock.calls[0].arguments[0].companyId, legacyId);
  }
  assert.equal(links.mock.calls[0].arguments[0], legacyId);
});
