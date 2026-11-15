import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'events';
import {createProspectingRouter} from '../src/routes/prospecting.routes';
import {ProspectingService} from '../src/prospecting/service';
import {memoryJobStore} from '../src/prospecting/store';
import {initialState} from '../src/prospecting/contracts';
test('HTTP exposes real empty state, validates scheduling, starts async run and protects wake endpoint',async()=>{
 const service=new ProspectingService(memoryJobStore(),async()=>({names:[],reports:[]}));
 const app=express();app.use(express.json());app.use(createProspectingRouter(service,()=>{}));app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode||err.status||400).json({message:'Invalid request'}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as any).port}`;
 try{
  const empty=await(await fetch(base)).json() as any;assert.deepEqual(empty.leads,[]);assert.equal(empty.run,null);
  const post=(path:string,data:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  assert.equal((await post('/settings',{...initialState().settings,intervalMinutes:1})).status,400);
  assert.equal((await post('/settings',{...initialState().settings,enabled:true,intervalMinutes:60})).status,200);
  assert.equal((await post('/wake',{})).status,401);
  assert.equal((await post('/run',{})).status,202);
  const running=await(await fetch(base)).json() as any;assert.equal(running.run.drafts,undefined);assert.equal(running.run.candidates,undefined);assert.equal(running.run.candidateCount,0);assert.ok(running.sourceCatalogue.length);
 }finally{server.close();await once(server,'close')}
});
