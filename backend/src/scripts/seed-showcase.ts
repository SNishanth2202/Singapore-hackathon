import dotenv from 'dotenv';
import path from 'node:path';

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });
  // Cloud writes are explicit; the default command only previews the dataset.
  process.env.STORAGE_MODE = 'cloud';
  const { buildShowcaseData, seedShowcaseData } = await import('../demo/showcase');
  const data = buildShowcaseData();
  if (!process.argv.includes('--write')) {
    console.log(JSON.stringify({ mode: 'dry-run', datasetTag: data.datasetTag, companies: data.profiles.length,
      salesEvents: data.events.length, conversations: data.management.length, notifications: data.notifications.length,
      note: 'Use --write to insert stable sample IDs into Atlas; existing records are preserved.' }, null, 2));
    return;
  }
  const { connectMongoDB, disconnectMongoDB } = await import('../integrations/mongodb/connection');
  const { connectNeo4j, disconnectNeo4j } = await import('../integrations/neo4j/connection');
  try {
    await connectMongoDB();
    console.log(JSON.stringify(await seedShowcaseData(), null, 2));
    if (process.argv.includes('--graph')) {
      await connectNeo4j();
      const { projectResearch } = await import('../integrations/neo4j/researchGraph');
      const { ResearchSnapshot } = await import('../models/CloudStorage');
      for (const research of data.research) {
        await projectResearch(research);
        await ResearchSnapshot.updateOne({ _id: research.id }, { $set: { graphStatus: 'SYNCED', graphSyncedAt: new Date() } });
      }
      console.log('Projected the 12 illustrative research snapshots into Aura.');
    }
  } finally { await Promise.allSettled([disconnectMongoDB(), disconnectNeo4j()]); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Sample import failed.'); process.exitCode = 1; });
