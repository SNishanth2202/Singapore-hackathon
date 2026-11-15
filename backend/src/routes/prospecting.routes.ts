import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {timingSafeEqual} from 'crypto';
import {prospectingService,startProspectingWorker} from '../prospecting/service';
import {sourceCatalogue} from '../prospecting/research';
import {State, topLeads} from '../prospecting/contracts';
export function publicResearchState(state:State) {
 const active=!!state.run&&['discovering','researching'].includes(state.run.status);
 const current=active&&!!state.run?.drafts.length;
 return {...state, leads:current?topLeads(state.run!.drafts):state.leads,
  displayMode:current?'current_run':active?(state.leads.length?'previous_run':'awaiting_results'):'completed',
  reviewedCompanies:state.run?.reviews??[],
  run:state.run?{...state.run,drafts:undefined,reviews:undefined,candidates:undefined,discoveryEvidence:undefined,candidateCount:state.run.candidates.length,qualifiedCount:state.run.drafts.length}:null};
}
export function createProspectingRouter(service=prospectingService, startWorker= startProspectingWorker) { const router=Router();
router.use(rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false}));
const safe=publicResearchState;
router.get('/',async(_req,res,next)=>{try{res.setHeader('Cache-Control','no-store');res.json({...safe(await service.read()),sourceCatalogue,scheduler:{storage:process.env.STORAGE_MODE==='memory'?'temporary local memory':'MongoDB Atlas',pollSeconds:15,externalWakeConfigured:!!process.env.PROSPECTING_WAKE_SECRET}})}catch(e){next(e)}});
router.post('/settings',async(req,res,next)=>{try{res.json(safe(await service.settings(req.body)));startWorker()}catch(e){next(e)}});
router.post('/run',async(_req,res,next)=>{try{const state=await service.start();startWorker();res.status(202).json(safe(state));void service.tick().catch(()=>{})}catch(e){next(e)}});
router.post('/wake',async(req,res,next)=>{try{const expected=process.env.PROSPECTING_WAKE_SECRET??'',actual=req.headers.authorization?.replace(/^Bearer /,'')??'';if(!expected||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual))){res.status(401).json({message:'Scheduler authorization required'});return}await service.tick();res.json({ok:true})}catch(e){next(e)}});
return router; }
export default createProspectingRouter();
