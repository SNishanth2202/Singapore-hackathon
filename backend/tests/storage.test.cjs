const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.STORAGE_MODE='memory';process.env.LOCAL_DEMO_MODE='true';process.env.NODE_ENV='test';
const {saveResearch,loadResearch,listResearch}=require('../dist/integrations/research/store');
const {saveAnalysis,latestAnalysis,loadAnalysis}=require('../dist/integrations/research/analysisStore');
const {researchGraphData}=require('../dist/integrations/neo4j/researchGraph');
const {retryDelay,syncNextResearch}=require('../dist/integrations/neo4j/syncWorker');
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
