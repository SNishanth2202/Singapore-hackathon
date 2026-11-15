import '../config/env';
import fs from 'fs';
import path from 'path';
import { extractWithTerra } from '../customer-graph/extract';
import { REPO_ROOT } from '../ranking/seed';
import { CustomerGraphStore } from '../customer-graph/store';

async function main() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('Set OPENAI_API_KEY to create a real GPT-6.1 Terra demo extraction.');
  const run = await extractWithTerra(key);
  if (process.argv.includes('--bundle')) {
    fs.writeFileSync(path.join(REPO_ROOT, 'backend/src/fixtures/customer-graph/terra-run.json'), JSON.stringify(run, null, 2) + '\n', 'utf8');
  }
  const snapshot = await new CustomerGraphStore().save(run);
  console.log(JSON.stringify({ runId: run.id, model: run.model, facts: run.extraction.facts.length, ideas: run.extraction.ideas.length,
    nodes: snapshot.graph.nodes.length, edges: snapshot.graph.edges.length, storage: snapshot.storage, totalTokens: run.totalTokens }, null, 2));
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
