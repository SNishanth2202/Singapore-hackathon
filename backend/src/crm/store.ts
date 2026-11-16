import mongoose from 'mongoose';
import { env } from '../config/env';
import { requireCloudMongo } from '../models/CloudStorage';
import { CrmAccount, CrmArtifact, CrmDataset, CrmExtraction } from '../models/Crm';
import { AppError } from '../utils/errors';
import { buildCrmSeedDocuments, CRM_DATASET_TAG, CrmStoredDataset, CrmPersistence, validateStoredCrmDataset, crmHash } from './dataset';

/** Immutable imported payloads stay fixed; unrelated user fields and active-run pointers are preserved. */
export function crmSeedDecision(document: { _id: string; contentHash?: string; record?: unknown }, existing: any): 'insert' | 'preserve' {
  if (!existing) return 'insert';
  if (document.contentHash && (existing.contentHash !== document.contentHash || crmHash(existing.record) !== crmHash(document.record))) {
    throw new AppError('An existing CRM record has different accepted content. It was preserved; use a new dataset version.', 409, 'CRM_SEED_CONFLICT');
  }
  return 'preserve';
}

export async function readCrmDataset(): Promise<{ data: CrmStoredDataset; persistence: CrmPersistence }> {
  if (env.STORAGE_MODE === 'memory') {
    return { data: buildCrmSeedDocuments(), persistence: { mode: 'memory', durable: false } };
  }
  requireCloudMongo();
  const pointer = await CrmDataset.findById(CRM_DATASET_TAG).lean() as unknown as CrmStoredDataset['datasets'][number] | null;
  if (!pointer) throw new AppError('Import the CRM account dataset into Atlas before using cloud customer records.', 503, 'CRM_IMPORT_REQUIRED');
  const [accounts, artifacts, extraction] = await Promise.all([
    CrmAccount.find({ datasetTag: CRM_DATASET_TAG }).sort({ _id: 1 }).lean(),
    CrmArtifact.find({ datasetTag: CRM_DATASET_TAG }).sort({ _id: 1 }).lean(),
    CrmExtraction.findById(pointer.currentRunId).lean(),
  ]);
  const data = { accounts, artifacts, extractions: extraction ? [extraction] : [], datasets: [pointer] } as unknown as CrmStoredDataset;
  validateStoredCrmDataset(data);
  return { data, persistence: { mode: 'cloud', durable: true } };
}

/** Upsert only missing stable IDs. An incompatible immutable record aborts without overwriting it. */
export async function seedCrmDataset() {
  requireCloudMongo();
  const built = buildCrmSeedDocuments();
  const collections = [
    { name: 'crm_accounts', model: CrmAccount, documents: built.accounts },
    { name: 'crm_artifacts', model: CrmArtifact, documents: built.artifacts },
    { name: 'crm_extractions', model: CrmExtraction, documents: built.extractions },
    { name: 'crm_datasets', model: CrmDataset, documents: built.datasets },
  ];
  for (const item of collections) await item.model.createCollection();
  const session = await mongoose.startSession();
  let inserted = 0, preserved = 0;
  try {
    await session.withTransaction(async () => {
      inserted = 0; preserved = 0;
      for (const item of collections) for (const document of item.documents) {
        const existing = await item.model.findById(document._id).session(session).lean() as any;
        if (crmSeedDecision(document, existing) === 'preserve') {
          preserved++; continue;
        }
        await item.model.create([document], { session }); inserted++;
      }
    });
  } finally { await session.endSession(); }
  return { datasetTag: CRM_DATASET_TAG, collections: collections.map(item => item.name), counts: built.counts, inserted, preserved };
}
