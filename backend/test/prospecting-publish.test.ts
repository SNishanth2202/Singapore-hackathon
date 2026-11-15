import test from 'node:test';
import assert from 'node:assert/strict';
import {publishProspect} from '../src/prospecting/publish';
test('only model-supported cited service hypotheses reach the sales worklist',async()=>{
 const calls:any[]=[];const handoff:any=async(value:any)=>{calls.push(value)};
 const lead:any={id:'Q1',name:'Company',researchId:'research-1',sources:[{id:'source-1',title:'Expansion',url:'https://example.com',publishedAt:null}],fitStatus:'SUPPORTED',analysisOrigin:'model',analysis:{possibleNeeds:[{offeringId:'connectivity',evidenceIds:['source-1']},{offeringId:'invalid',evidenceIds:['foreign']}]}};
 await publishProspect(lead,handoff);assert.equal(calls.length,1);assert.equal(calls[0].companyId,'entity:Q1');assert.deepEqual(calls[0].candidates,[{opportunityId:'research-1:connectivity',service:'connectivity'}]);
 await publishProspect({...lead,analysisOrigin:'sources_only'},handoff);await publishProspect({...lead,fitStatus:'NEEDS_RESEARCH'},handoff);assert.equal(calls.length,1);
});
