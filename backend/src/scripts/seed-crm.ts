import dotenv from 'dotenv';
import path from 'node:path';

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });
  process.env.STORAGE_MODE = 'cloud';
  const { buildCrmSeedDocuments } = await import('../crm/dataset');
  const built = buildCrmSeedDocuments();
  if (!process.argv.includes('--write')) {
    console.log(JSON.stringify({ mode: 'dry-run', datasetTag: built.datasetTag,
      collections: Object.keys(built.collections), counts: built.counts,
      note: 'No database write. Use --write to insert the explicit CRM fixture without overwriting existing records.' }, null, 2));
    return;
  }
  const { connectMongoDB, disconnectMongoDB } = await import('../integrations/mongodb/connection');
  const { connectNeo4j, disconnectNeo4j } = await import('../integrations/neo4j/connection');
  try {
    await connectMongoDB();
    const { seedCrmDataset, readCrmDataset } = await import('../crm/store');
    console.log(JSON.stringify(await seedCrmDataset(), null, 2));
    if (process.argv.includes('--graph')) {
      await connectNeo4j();
      const { CustomerGraphStore } = await import('../customer-graph/store');
      const { validateStoredCrmDataset } = await import('../crm/dataset');
      const accepted = validateStoredCrmDataset((await readCrmDataset()).data);
      const graphStore = new CustomerGraphStore(), current = await graphStore.read();
      if (current.storage.mode === 'neo4j' && current.run?.id !== accepted.id) {
        console.log('The existing accepted Aura generation was preserved. MongoDB CRM records are ready.');
      } else {
        const result = await graphStore.save(accepted);
        if (result.storage.mode !== 'neo4j' || !result.storage.synced) throw new Error('CRM graph sync did not verify durable Aura storage.');
        console.log('CRM source context synced to the existing Aura graph.');
      }
    }
  } finally { await Promise.allSettled([disconnectMongoDB(), disconnectNeo4j()]); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'CRM import failed.'); process.exitCode = 1; });
