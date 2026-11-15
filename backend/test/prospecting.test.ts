import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryJobStore} from '../src/prospecting/store';
import {ProspectingService} from '../src/prospecting/service';
import {initialState,SettingsSchema,topLeads,Lead} from '../src/prospecting/contracts';
import {balancedDiscoveryItems,buildDiscoveryQueries,evidenceForModel,groundedCandidates,headlineCompanyCandidates,parseDiscoveryFeed,sourceOnlyReport,structured} from '../src/prospecting/research';
import {freeLlmClient} from '../src/integrations/freellmapi/client';
import {AppError} from '../src/utils/errors';
import {z} from 'zod';
import {publicResearchState} from '../src/routes/prospecting.routes';
import {getSeedKnowledge} from '../src/business/store';
import {detectEventType} from '../src/integrations/research/events';
import {parseNews,researchIdentity} from '../src/integrations/research/service';
import * as publicSources from '../src/integrations/research/publicFetch';
import * as researchStorage from '../src/integrations/research/store';
import * as salesWorkflow from '../src/sales/workflow';
const settings=initialState().settings;
const lead=(id:string,score=50)=>({id,name:id,score} as Lead);

test('small research batches can be configured and retain their chosen limit', async()=>{
 const service=new ProspectingService(memoryJobStore(),async config=>({names:Array.from({length:config.maxCandidates},(_,i)=>`Company ${i+1}`),reports:[]}),async name=>lead(name));
 await service.settings({...settings,maxCandidates:2});await service.start();await service.tick();await service.tick();await service.tick();await service.tick();
 const state=await service.read();assert.equal(state.run?.status,'completed');assert.equal(state.leads.length,2);assert.equal(state.run?.settings.maxCandidates,2);assert.equal(SettingsSchema.safeParse({...settings,maxCandidates:0}).success,false);
});

test('advertised but rejected tool support retries plain JSON once, without relaxing schema validation',async(t)=>{
 t.mock.method(freeLlmClient,'supportedParameters',async()=>['tools','tool_choice']);let calls=0;
 t.mock.method(freeLlmClient,'generateText',async(_messages:any,_maxTokens:any,options:any)=>{calls++;if(calls===1){assert.ok(options.structuredTool);throw new AppError('Provider rejected tool request',502,'AI_UPSTREAM_ERROR')}assert.equal(options.structuredTool,undefined);return {model:'test-model',reply:'{"supported":true}'}});
 const result=await structured(z.object({supported:z.boolean()}).strict(),'Use supplied evidence only',{});assert.equal(result.value.supported,true);assert.equal(calls,2);
 calls=0;t.mock.method(freeLlmClient,'generateText',async()=>{calls++;throw new AppError('Quota exhausted',503,'AI_RATE_LIMITED')});
 await assert.rejects(structured(z.object({supported:z.boolean()}),'Use supplied evidence only',{}),{code:'AI_RATE_LIMITED'});assert.equal(calls,1);
});

test('AI evidence keeps exact citation IDs and factual content without oversized feed URLs',()=>{
 const source:any={id:'src-a',kind:'news_headline',title:'Example opens a site',publisher:'Publisher',excerpt:'Retrieved headline only',publishedAt:'2026-11-15T00:00:00Z',verification:'headline_only',url:'https://news.google.com/rss/articles/'+ 'a'.repeat(4000),contentHash:'hash',retrievedAt:'2026-11-15T00:00:01Z'};
 const compact=evidenceForModel([source]);assert.equal(compact[0].id,source.id);assert.equal(compact[0].excerpt,source.excerpt);assert.equal(compact[0].publishedAt,source.publishedAt);assert.equal(compact[0].verification,'headline_only');
 assert.ok(JSON.stringify(compact).length<JSON.stringify([source]).length/4);assert.ok(!('url' in compact[0]));assert.ok(source.url.startsWith('https://'));
});
test('public-source fallback derives candidate names only from cited headline subjects',()=>{
 const rows=[{id:'1',title:'Example Retail opens a Singapore branch'},{id:'2',title:'Example Bank to invest in a data centre'},{id:'3',title:'How companies can use AI'},{id:'4',title:'Global business outlook'},{id:'5',title:"Revolut's plans for expansion"},{id:'6',title:'Logistics giant Katoen Natie expands in Singapore'},{id:'7',title:'Singapore joins 13 countries to launch a programme'},{id:'8',title:'Singapore, European Union signs an agreement'}] as any;
 assert.deepEqual(headlineCompanyCandidates(rows),['Example Retail','Example Bank','Revolut','Katoen Natie']);
});

test('unresolved reported names retain headline evidence without inventing a registry profile or rank',async(t)=>{
 t.mock.method(publicSources,'publicFetch',async()=>({text:'<rss><channel></channel></rss>'}));
 t.mock.method(researchStorage,'saveResearch',async()=>{});
 t.mock.method(salesWorkflow,'recordDiscoverySnapshot',async()=>{});
 const identity={entityId:'public-name-unit-test',name:'Example Retail',description:'Reported company name; identity unverified',website:null,wikipediaTitle:null,aliases:[],identitySource:'https://example.com/news'};
 const headline:any={id:'headline-1',kind:'news_headline',title:'Example Retail opens a branch',url:identity.identitySource,publisher:'Example Publisher',excerpt:'Publisher-reported headline only',publishedAt:new Date().toISOString(),retrievedAt:new Date().toISOString(),verification:'headline_only'};
 const record=await researchIdentity(identity,[headline],true);
 assert.deepEqual(record.sources,[headline]);assert.ok(record.warnings.some(w=>w.includes('legal identity')&&w.includes('unverified')));
 const report=sourceOnlyReport(record,getSeedKnowledge(),Error('Identity unresolved'));
 assert.equal(report.identityStatus,'UNVERIFIED');assert.equal(report.fitStatus,'NEEDS_RESEARCH');assert.equal(report.score,0);
 const store=memoryJobStore();const service=new ProspectingService(store,async()=>({names:[identity.name],reports:[]}),async()=>report);
 await service.start();await service.tick();await service.tick();
 const state=publicResearchState(await service.read());assert.equal(state.leads.length,0);assert.equal(state.displayMode,'awaiting_results');assert.equal(state.reviewedCompanies[0].sources[0].id,headline.id);
});
test('retired industry filters are discarded and cross-industry queries cover market events',()=>{
 const parsed=SettingsSchema.parse({...settings,industries:['manufacturing']});assert.equal('industries' in parsed,false);
 const queries=buildDiscoveryQueries(parsed,getSeedKnowledge());assert.ok(queries.some(q=>q.includes('acquisition')));assert.ok(queries.some(q=>q.includes('cloud migration')));assert.ok(!queries.some(q=>q.includes('logistics')));
 const groups=[[{id:'a'},{id:'b'},{id:'c'}],[{id:'d'},{id:'e'}]] as any;
 assert.deepEqual(balancedDiscoveryItems(groups,3).map(i=>i.id),['a','d','b']);
});
test('fresh company reports appear before batch completion; unsupported reports stay outside top ranks',async()=>{
 const store=memoryJobStore();const service=new ProspectingService(store,async()=>({names:['Supported','Unconfirmed','Later'],reports:[]}),async name=>({...lead(name),fitStatus:name==='Unconfirmed'?'NEEDS_RESEARCH':'SUPPORTED'}));
 await service.start();await service.tick();await service.tick();let state=publicResearchState(await service.read());
 assert.equal(state.run?.status,'researching');assert.equal(state.displayMode,'current_run');assert.equal(state.leads[0].id,'Supported');assert.equal(state.reviewedCompanies.length,1);assert.equal(state.run?.currentCompany,'Unconfirmed');
 await service.tick();state=publicResearchState(await service.read());assert.equal(state.reviewedCompanies.length,2);assert.equal(state.leads.length,1);assert.equal(state.reviewedCompanies[1].fitStatus,'NEEDS_RESEARCH');
 assert.equal(state.run?.drafts,undefined);assert.equal(state.run?.reviews,undefined);
});
test('AI failure keeps sourced company research inspectable without fabricating a service or score',()=>{
 const record:any={id:'research-test',company:{entityId:'Q1',name:'Example Corp',description:'A company',website:null,aliases:[]},sources:[{id:'s1',kind:'company_profile',title:'Registry entry',publishedAt:null}],warnings:['Official website blocked'],createdAt:new Date().toISOString()};
 const report=sourceOnlyReport(record,getSeedKnowledge(),Error('internal detail'));
 assert.equal(report.analysisOrigin,'sources_only');assert.equal(report.sources.length,1);assert.equal(report.model,null);assert.deepEqual(report.analysis.possibleNeeds,[]);assert.equal(report.score,0);assert.ok(!report.fitReason?.includes('internal detail'));assert.deepEqual(report.sourceWarnings,record.warnings);
});
test('an AI-unavailable batch keeps old rankings and exposes newly collected company reports',async()=>{
 const store=memoryJobStore();let unavailable=false;
 const service=new ProspectingService(store,async()=>({names:['Company'],reports:[]}),async()=>({...lead(unavailable?'New report':'Prior result'),fitStatus:unavailable?'NEEDS_RESEARCH':'SUPPORTED',analysisOrigin:unavailable?'sources_only':'model'}));
 await service.start();for(let i=0;i<3;i++)await service.tick();unavailable=true;
 await service.start();for(let i=0;i<3;i++)await service.tick();
 const state=publicResearchState(await service.read());assert.equal(state.run?.status,'failed');assert.equal(state.leads[0].id,'Prior result');assert.equal(state.reviewedCompanies[0].id,'New report');assert.equal(state.history[0].status,'failed');assert.equal((state.history[0] as any).reviews,undefined);
});
test('autonomous company news rejects surname collisions and unrelated businesses',()=>{
 const company={entityId:'Q1532489',name:'Pall Corporation',aliases:[],description:'American company',website:null,wikipediaTitle:null,identitySource:'https://www.wikidata.org/wiki/Q1532489'};
 const xml='<rss><channel>'+['Pall Corporation breaks ground on a manufacturing facility','67 Pall Mall opens a club','Meet Zeba Pall'].map(title=>`<item><title>${title}</title><link>https://news.google.com/articles/${encodeURIComponent(title)}</link><pubDate>${new Date(Date.now()-1000).toUTCString()}</pubDate></item>`).join('')+'</channel></rss>';
 const rows=parseNews(xml,company,true);assert.equal(rows.length,1);assert.match(rows[0].title,/Pall Corporation/);
});
test('facility construction headlines establish expansion, unrelated ground commentary does not',()=>{assert.equal(detectEventType('Pall Corporation breaks ground on manufacturing facility in Singapore'),'EXPANSION');assert.equal(detectEventType('Analyst breaks ground on a new theory'),'OTHER')});
test('source parsing rejects stale/future/insecure items; candidates must be cited verbatim',()=>{
 const now=Date.now(),date=new Date(now-1000).toUTCString();
 const xml=`<rss><channel><item><title>Example Logistics expands facility</title><link>https://news.google.com/article/a</link><pubDate>${date}</pubDate></item><item><title>Old</title><link>https://news.google.com/a</link><pubDate>1 Jan 2020</pubDate></item><item><title>Private</title><link>http://127.0.0.1/x</link><pubDate>${date}</pubDate></item></channel></rss>`;
 const items=parseDiscoveryFeed(xml,'unit-test',now);assert.equal(items.length,1);
 assert.deepEqual(groundedCandidates({companies:[{name:'Invented Corp',evidenceIds:[items[0].id]},{name:'Example Logistics',evidenceIds:['invented']},{name:'Example Logistics',evidenceIds:[items[0].id]}]},items),['Example Logistics']);
});
test('real queue starts empty and top list contains at most 15 distinct companies',()=>{assert.deepEqual(initialState().leads,[]);const rows=topLeads([...Array.from({length:30},(_,i)=>lead(String(i),i)),lead('29',29)]);assert.equal(rows.length,15);assert.equal(new Set(rows.map(r=>r.id)).size,15);assert.equal(rows[0].id,'29');assert.equal(SettingsSchema.safeParse({...settings,intervalMinutes:0}).success,false)});
test('leases prevent concurrent workers and settings changes during a research step',async()=>{
 const store=memoryJobStore();let release!:()=>void;const blocker=new Promise<void>(r=>release=r);
 const service=new ProspectingService(store,async()=>{await blocker;return {names:[],reports:[]}});
 await service.start();const work=service.tick();await new Promise(r=>setImmediate(r));await assert.rejects(service.start(),{code:'RESEARCH_BUSY'});await service.tick();release();await work;
});
test('schedule follows chosen interval, survives service recreation, pause prevents later runs',async()=>{
 let now=1000000;const store=memoryJobStore();let calls=0;const discovery=async()=>{calls++;return {names:['A','B'],reports:[]}};
 const service=new ProspectingService(store,discovery,async name=>lead(name),()=>now);
 await service.settings({...settings,enabled:true,intervalMinutes:15});await service.tick();assert.equal(calls,0);now+=900000;
 const restarted=new ProspectingService(store,discovery,async name=>lead(name),()=>now);
 for(let i=0;i<4;i++)await restarted.tick();const state=await restarted.read();assert.equal(calls,1);assert.equal(state.leads.length,2);assert.equal(state.run?.status,'completed');assert.equal(Date.parse(state.nextRunAt!),now+900000);
 await restarted.settings({...settings,enabled:false});now+=9999999;await restarted.tick();assert.equal(calls,1);
});
test('failed discovery or research preserves last success; genuine empty run removes old results',async()=>{
 const store=memoryJobStore();let fail=false,empty=false;const service=new ProspectingService(store,async()=>{if(fail)throw Error('failure');return {names:empty?[]:['A'],reports:[]}},async name=>lead(name));
 await service.start();for(let i=0;i<3;i++)await service.tick();assert.equal((await service.read()).leads.length,1);
 fail=true;await service.start();await service.tick();assert.equal((await service.read()).leads.length,1);assert.equal((await service.read()).run?.status,'failed');
 fail=false;empty=true;await service.start();await service.tick();await service.tick();assert.equal((await service.read()).leads.length,0);
});
