import {initializeDatabases,closeDatabases} from '../config/database';
import {prospectingService} from '../prospecting/service';
let stopped=false;
process.on('SIGTERM',()=>{stopped=true});process.on('SIGINT',()=>{stopped=true});
async function main(){await initializeDatabases();try{while(!stopped){try{await prospectingService.tick()}catch{process.stderr.write('Research worker step unavailable; will retry.\n')}await new Promise(r=>setTimeout(r,5000))}}finally{await closeDatabases()}}
void main().catch(()=>{process.stderr.write('Research worker could not connect to cloud storage.\n');process.exitCode=1});
