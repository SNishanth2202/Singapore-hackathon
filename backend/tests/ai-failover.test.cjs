const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createFailoverClient}=require('../dist/integrations/freellmapi/client');
const {resolveAiFallbackConfiguration}=require('../dist/config/ai');
const {deploymentConfigurationProblems}=require('../dist/config/deployment');
const primary={baseUrl:'https://primary.example/v1',apiKey:'test-primary-key',model:'primary-model',timeoutMs:100};
const fallback={baseUrl:'http://127.0.0.1:31415/v1',apiKey:'test-local-key',model:'local-model',timeoutMs:100};
const messages=[{role:'user',content:'Return a sourced assessment'}];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
const completion=(model='served-fallback')=>json({model,choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]});

test('healthy primary never contacts the fallback',async()=>{
 const calls=[];const client=createFailoverClient(primary,fallback,async(url,options)=>{calls.push(url);assert.equal(options.headers.Authorization,'Bearer test-primary-key');return completion('served-primary')});
 const result=await client.generateText(messages);assert.equal(result.model,'served-primary');assert.equal(result.fallbackUsed,false);assert.equal(calls.length,1);assert.ok(calls[0].startsWith(primary.baseUrl));
});

test('FreeLLM uses its native reasoning control independently from OpenRouter',async()=>{
 const client=createFailoverClient(primary,{...fallback,reasoningEffort:'none',reasoningFormat:'openai'},async(url,options)=>{
  if(url.startsWith(primary.baseUrl))return json({},429);
  const body=JSON.parse(options.body);assert.equal(body.reasoning_effort,'none');assert.equal(body.reasoning,undefined);return completion();
 });
 assert.equal((await client.generateText(messages)).fallbackUsed,true);
});

test('FreeLLM JSON compatibility mode avoids rejected tools and keeps schema instructions',async()=>{
 const client=createFailoverClient(primary,{...fallback,structuredTools:false},async(url,options)=>{
  if(url.startsWith(primary.baseUrl))return json({},429);
  assert.ok(url.endsWith('/chat/completions'));const body=JSON.parse(options.body);assert.equal(body.tools,undefined);assert.match(body.messages[0].content,/Return only JSON/);return completion();
 });
 const result=await client.generateText(messages,100,{structuredTool:{name:'submit',schema:{type:'object'}}});assert.equal(result.fallbackUsed,true);assert.deepEqual(await client.supportedParameters(),[]);
});

test('quota failure uses separate fallback credentials, adapts structured output, and probes primary after cooldown',async()=>{
 let now=1000,primaryCalls=0;const fallbackCalls=[];
 const client=createFailoverClient(primary,fallback,async(url,options)=>{
  if(url.startsWith(primary.baseUrl)){primaryCalls++;assert.equal(options.headers.Authorization,'Bearer test-primary-key');return primaryCalls===1?json({error:'private upstream detail'},429):completion('primary-recovered')}
  fallbackCalls.push(url);assert.equal(options.headers.Authorization,'Bearer test-local-key');
  if(url.endsWith('/models'))return json({data:[{id:fallback.model}]});
  const body=JSON.parse(options.body);assert.equal(body.model,fallback.model);assert.equal(body.tools,undefined);assert.match(body.messages[0].content,/Return only JSON/);return completion();
 },()=>now);
 const options={includeMetadata:true,structuredTool:{name:'submit',schema:{type:'object'}}};
 const first=await client.generateText(messages,100,options);assert.equal(first.fallbackUsed,true);assert.equal(first.provider,'freellmapi');assert.equal(first.model,'served-fallback');
 await client.generateText(messages,100,options);assert.equal(primaryCalls,1);assert.equal(fallbackCalls.filter(url=>url.endsWith('/models')).length,1);
 now+=120001;assert.equal((await client.generateText(messages)).model,'primary-recovered');assert.equal(primaryCalls,2);
});

test('fallback keeps native tool output when its model explicitly supports it',async()=>{
 const client=createFailoverClient(primary,fallback,async(url,options)=>{
  if(url.startsWith(primary.baseUrl))return json({},503);
  if(url.endsWith('/models'))return json({data:[{id:fallback.model,supported_parameters:['tools','tool_choice']}]});
  assert.ok(JSON.parse(options.body).tools);
  return json({model:'local-tool-model',choices:[{message:{content:null,tool_calls:[{type:'function',function:{name:'submit',arguments:'{"ok":true}'}}]},finish_reason:'tool_calls'}]});
 });
 const result=await client.generateText(messages,100,{includeMetadata:true,structuredTool:{name:'submit',schema:{type:'object'}}});assert.equal(result.reply,'{"ok":true}');assert.equal(result.fallbackUsed,true);
});

test('disabled fallback does not borrow a legacy key; invalid input does not trigger fallback',async()=>{
 let calls=0;const client=createFailoverClient(primary,undefined,async()=>{calls++;return json({},429)});
 await assert.rejects(client.generateText(messages),{code:'AI_RATE_LIMITED'});await assert.rejects(client.generateText(messages),{code:'AI_RATE_LIMITED'});assert.equal(calls,1);
 const enabled=createFailoverClient(primary,fallback,async()=>{throw Error('network must not be called')});
 await assert.rejects(enabled.generateText([],10),{code:'AI_INVALID_INPUT'});
 const config={AI_BASE_URL:primary.baseUrl,AI_API_KEY:primary.apiKey,AI_MODEL:primary.model,FREELLMAPI_BASE_URL:fallback.baseUrl,FREELLMAPI_API_KEY:fallback.apiKey,FREELLMAPI_MODEL:fallback.model,FREELLMAPI_TIMEOUT_MS:1000};
 assert.equal(resolveAiFallbackConfiguration(config),undefined);
 assert.equal(resolveAiFallbackConfiguration({...config,AI_FREELLM_FALLBACK_ENABLED:true}).apiKey,fallback.apiKey);
});

test('both exhausted providers fail safely and neither is hammered during cooldown',async()=>{
 let calls=0;const client=createFailoverClient(primary,fallback,async()=>{calls++;return json({error:'secret upstream body'},429)});
 for(let i=0;i<2;i++)await assert.rejects(client.generateText(messages),e=>e.code==='AI_RATE_LIMITED'&&e.message.startsWith('FreeLLM fallback:')&&!e.message.includes('secret upstream body'));
 assert.equal(calls,2);
});

test('hosted preflight rejects a Desktop loopback fallback',()=>{
 const config={STORAGE_MODE:'memory',LOCAL_DEMO_MODE:true,HOSTED_PREVIEW:true,HOST:'0.0.0.0',CORS_ORIGIN:'https://example.vercel.app',AI_BASE_URL:primary.baseUrl,AI_API_KEY:primary.apiKey,AI_MODEL:primary.model,AI_FREELLM_FALLBACK_ENABLED:true,FREELLMAPI_BASE_URL:fallback.baseUrl,FREELLMAPI_API_KEY:fallback.apiKey,FREELLMAPI_MODEL:fallback.model,FREELLMAPI_TIMEOUT_MS:1000};
 assert.ok(deploymentConfigurationProblems(config).some(message=>message.startsWith('FreeLLM fallback:')));
 assert.deepEqual(deploymentConfigurationProblems({...config,FREELLMAPI_BASE_URL:'https://fallback.example/v1',FREELLMAPI_MODEL:'auto'}),[]);
});
