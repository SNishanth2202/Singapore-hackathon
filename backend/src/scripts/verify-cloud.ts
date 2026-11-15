import { initializeDatabases, closeDatabases } from '../config/database';
import { env } from '../config/env';
import { businessKnowledgeStore } from '../business/store';
import { applyConstraints } from '../integrations/neo4j/graphService';
import { cloudConfigurationProblems } from '../config/cloud';
import { ensureCloudIndexes } from '../models/CloudStorage';

async function verify() {
  const problems = cloudConfigurationProblems(env);
  if (env.STORAGE_MODE !== 'cloud') problems.push('Set STORAGE_MODE=cloud before verifying cloud databases.');
  if (problems.length) throw new Error(problems.join(' '));
  try {
    await initializeDatabases(); await ensureCloudIndexes(); await applyConstraints();
    const knowledge = await businessKnowledgeStore.read();
    console.log(`Atlas and Aura connections verified. Business knowledge version ${knowledge.version} is available in Atlas.`);
  } finally { await closeDatabases(); }
}
verify().catch(error => { console.error('Cloud verification failed:', error instanceof Error ? error.message : 'Check database configuration.'); process.exitCode = 1; });
