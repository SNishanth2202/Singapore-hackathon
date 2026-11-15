const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { resolveAiConfiguration, publicAiConfigurationProblems } = require('../dist/config/ai');
const { deploymentConfigurationProblems } = require('../dist/config/deployment');
const { createFreeLlmClient } = require('../dist/integrations/freellmapi/client');

const legacy = { FREELLMAPI_BASE_URL: 'http://127.0.0.1:31415/v1', FREELLMAPI_API_KEY: 'local-only-test-key',
  FREELLMAPI_MODEL: 'local-model', FREELLMAPI_TIMEOUT_MS: 1000 };
const hosted = { ...legacy, STORAGE_MODE: 'cloud', LOCAL_DEMO_MODE: false, HOST: '0.0.0.0',
  CORS_ORIGIN: 'https://example.vercel.app', MONGODB_URI: 'mongodb+srv://user:test@cluster.mongodb.net/',
  NEO4J_URI: 'neo4j+s://test.databases.neo4j.io', NEO4J_USERNAME: 'neo4j', NEO4J_PASSWORD: 'test-cloud-password',
  AI_BASE_URL: 'https://openrouter.ai/api/v1', AI_API_KEY: 'test-hosted-key', AI_MODEL: 'test-model:free' };

test('generic provider settings never borrow a local router key or model', () => {
  assert.equal(resolveAiConfiguration(legacy).apiKey, legacy.FREELLMAPI_API_KEY);
  const partial = resolveAiConfiguration({ ...legacy, AI_BASE_URL: hosted.AI_BASE_URL });
  assert.equal(partial.apiKey, ''); assert.equal(partial.model, '');
  assert.equal(resolveAiConfiguration(hosted).apiKey, hosted.AI_API_KEY);
});

test('production preflight rejects local AI, demo storage, placeholders and wildcard origins', () => {
  assert.deepEqual(deploymentConfigurationProblems(hosted), []);
  for (const change of [{AI_BASE_URL:'http://127.0.0.1:31415/v1'}, {AI_BASE_URL:'https://127.0.0.1/v1'},
    {AI_BASE_URL:'https://user:password@router.example.com/v1'}, {AI_BASE_URL:'https://router.example.com/v1?key=secret'},
    {AI_API_KEY:''}, {AI_MODEL:'auto'}, {STORAGE_MODE:'memory'}, {LOCAL_DEMO_MODE:true}, {HOST:'127.0.0.1'},
    {CORS_ORIGIN:'*'}, {CORS_ORIGIN:'https://example.vercel.app/'}, {MONGODB_URI:'mongodb://localhost/database'},
    {NEO4J_URI:'bolt://localhost:7687'}, {NEO4J_PASSWORD:'your_password'}]) {
    assert.ok(deploymentConfigurationProblems({...hosted,...change}).length, JSON.stringify(Object.keys(change)));
  }
  assert.deepEqual(publicAiConfigurationProblems(resolveAiConfiguration({...hosted, AI_MODELS_URL:'https://openrouter.ai/api/v1/models'})), []);
  const preview = {...hosted, STORAGE_MODE:'memory',LOCAL_DEMO_MODE:true,HOSTED_PREVIEW:true,MONGODB_URI:'',NEO4J_URI:'',NEO4J_PASSWORD:''};
  assert.deepEqual(deploymentConfigurationProblems(preview), []);
  assert.ok(deploymentConfigurationProblems({...preview,HOSTED_PREVIEW:false}).length);
});

test('Responses API extracts only assistant output text and uses the configured protocol', async () => {
  const client = createFreeLlmClient({baseUrl:'https://router.example.com/v1',apiKey:'test-key',model:'test-model',timeoutMs:1000,protocol:'responses'}, async (url, options) => {
    assert.equal(url, 'https://router.example.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.max_output_tokens, 100); assert.equal(body.store, false); assert.ok(body.input.length);
    return new Response(JSON.stringify({model:'served-model',status:'completed',output:[
      {type:'reasoning',content:[{type:'output_text',text:'Do not expose reasoning.'}]},
      {type:'message',content:[{type:'output_text',text:'{"summary":"Supported result"}'}]},
    ]}));
  });
  const result = await client.generateText([{role:'user',content:'test'}],100);
  assert.equal(result.reply, '{"summary":"Supported result"}');
  assert.equal(result.model, 'served-model');
});

test('provider-specific model-list URLs and account errors remain safe', async () => {
  const config = {baseUrl:'https://router.example.com/openai/v1',modelsUrl:'https://router.example.com/v1/models',apiKey:'test-key',model:'test-model',timeoutMs:1000};
  const client = createFreeLlmClient(config, async url => { assert.equal(url, config.modelsUrl); return new Response(JSON.stringify({data:[{id:'test-model'}]})); });
  assert.deepEqual(await client.listModels(), ['test-model']);
  for (const [status,code] of [[402,'AI_CREDITS_REQUIRED'],[404,'AI_MODEL_UNAVAILABLE']]) {
    const rejected = createFreeLlmClient(config, async () => new Response(JSON.stringify({error:config.apiKey}),{status}));
    await assert.rejects(rejected.generateText([{role:'user',content:'test'}]), error => error.code===code&&!error.message.includes(config.apiKey));
  }
});

test('optional router reasoning setting is sent only when configured', async () => {
  const client=createFreeLlmClient({baseUrl:'https://router.example.com/v1',apiKey:'test-key',model:'test-model',timeoutMs:1000,reasoningEffort:'none'},async(_url,options)=>{
    assert.deepEqual(JSON.parse(options.body).reasoning,{effort:'none'});
    return new Response(JSON.stringify({model:'served-model',choices:[{message:{content:'OK'}}]}));
  });
  assert.equal((await client.generateText([{role:'user',content:'Test'}])).reply,'OK');
});

test('hosted routes allow research and analysis while enforcing CORS, rate limits and local-only edits', async t => {
  const {env} = require('../dist/config/env');
  const originalEnv = {...env};
  Object.assign(env,{NODE_ENV:'production',CORS_ORIGIN:hosted.CORS_ORIGIN,TRUST_PROXY_HOPS:1,AI_REQUESTS_PER_MINUTE:2,LOCAL_DEMO_MODE:false,STORAGE_MODE:'cloud'});
  const analysis = require('../dist/integrations/freellmapi/analyze');
  const research = require('../dist/integrations/research/service');
  const knowledge = require('../dist/business/store');
  const originals = {analyze:analysis.analyzeCompany,research:research.researchCompany,read:knowledge.businessKnowledgeStore.read};
  analysis.analyzeCompany = async () => ({checked:true});
  research.researchCompany = async () => ({company:{name:'Test organisation'},sources:[]});
  knowledge.businessKnowledgeStore.read = async () => knowledge.getSeedKnowledge();
  const app = require('../dist/app').default;
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));Object.assign(env,originalEnv);
    analysis.analyzeCompany=originals.analyze;research.researchCompany=originals.research;knowledge.businessKnowledgeStore.read=originals.read;});
  const base='http://127.0.0.1:'+server.address().port;
  const headers={Origin:hosted.CORS_ORIGIN,'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/',{headers:{Origin:'https://untrusted.example'}})).status,403);
  const info=await fetch(base+'/api/v1/ai/business-knowledge',{headers});
  assert.equal(info.status,200); assert.equal(info.headers.get('x-knowledge-editable'),'false');
  assert.equal(info.headers.get('access-control-allow-origin'),hosted.CORS_ORIGIN);
  assert.equal((await fetch(base+'/api/v1/ai/business-knowledge',{method:'PUT',headers,body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/v1/ai/models',{headers})).status,403);
  assert.equal((await fetch(base+'/api/v1/ai/test',{method:'POST',headers:{...headers,'X-Forwarded-For':'192.0.2.2'}})).status,403);
  const post=path=>fetch(base+path,{method:'POST',headers:{...headers,'X-Forwarded-For':'192.0.2.3'},body:JSON.stringify(path.endsWith('/analyze')?{companyId:'research-test'}:{entityId:'Q491748'})});
  assert.equal((await post('/api/v1/ai/analyze')).status,200);
  assert.equal((await post('/api/v1/ai/research')).status,201);
  assert.equal((await post('/api/v1/ai/analyze')).status,429);
  assert.equal((await fetch(base+'/api/v1/health/ready')).status,503);
});

test('explicit hosted preview runs sample accounts, dashboard and research without databases', async t => {
  const {env}=require('../dist/config/env'); const original={...env};
  Object.assign(env,{NODE_ENV:'production',STORAGE_MODE:'memory',HOSTED_PREVIEW:true,LOCAL_DEMO_MODE:true,CORS_ORIGIN:hosted.CORS_ORIGIN});
  delete require.cache[require.resolve('../dist/app')];
  const server=require('../dist/app').default.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));Object.assign(env,original);});
  const base='http://127.0.0.1:'+server.address().port;
  const companies=await fetch(base+'/api/v1/companies');assert.equal(companies.status,200);const c=await companies.json();assert.equal(c.data.length,2);assert.equal(c.dataMode,'sample');
  const analytics=await fetch(base+'/api/v1/analytics/overview');assert.equal(analytics.status,200);const a=await analytics.json();
  assert.equal(a.data.dataMode,'memory_preview');assert.ok(Number.isInteger(a.data.metrics.totalCompaniesDiscovered));
  assert.ok(Array.isArray(a.data.funnel));assert.ok(Array.isArray(a.data.interventions.items));
  const health=await fetch(base+'/api/v1/health/ready');assert.equal(health.status,200);assert.equal((await health.json()).storageMode,'temporary_preview');
  const overall=await fetch(base+'/api/v1/health');const h=await overall.json();assert.equal(h.services.mongodb,'not_configured');
});


test('a backend-only build initializes ranked leads with its bundled cited snapshots', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'singtel-ranking-package-'));
  try {
    const packagedBackend = path.join(temporaryRoot, 'backend');
    fs.cpSync(path.resolve(__dirname, '../dist'), path.join(packagedBackend, 'dist'), { recursive: true });
    const script = `const {RankingService}=require(process.argv[1]);const service=new RankingService(null);const queue=service.get();process.stdout.write(JSON.stringify({total:queue.total,initialized:queue.initialized,degraded:queue.degraded,sources:service.inspect().sources.length,excluded:queue.customerEligibility.excluded.length}));`;
    const result = execFileSync(process.execPath, ['-e', script, path.join(packagedBackend, 'dist/ranking/service.js')], {
      cwd: packagedBackend, encoding: 'utf8', env: { ...process.env, NODE_PATH: path.resolve(__dirname, '../node_modules') },
    });
    assert.deepEqual(JSON.parse(result), {total:11,initialized:true,degraded:false,sources:22,excluded:4});
    assert.equal(fs.existsSync(path.join(temporaryRoot, 'docs')), false);
  } finally {
    // Limit recursive cleanup to the exact temporary test directory just created.
    assert.equal(path.dirname(path.resolve(temporaryRoot)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporaryRoot).startsWith('singtel-ranking-package-'));
    fs.rmSync(temporaryRoot, {recursive:true,force:true});
  }
});
