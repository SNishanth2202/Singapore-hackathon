import { createHash } from 'node:crypto';
import { accounts, artifacts, entities } from '../customer-graph/fixtures';
import { companyBindings } from '../customer-graph/company-bindings';
import { Artifact, Entity, IngestionRun } from '../customer-graph/contracts';
import { validateRun } from '../customer-graph/extract';
import bundled from '../fixtures/customer-graph/terra-run.json';
import { AppError } from '../utils/errors';

export const CRM_DATASET_TAG = 'crm-existing-customer-context-v1';
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const crmHash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const artifactContentHash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

export interface CrmAccountRecord {
  id: string; name: string; industry: string; description: string; graphAccountId: string;
  externalAccountId: string | null; relationshipStatus: 'EXISTING_CUSTOMER';
  datasetTag: string; isSynthetic: true; entities: Entity[]; sourceArtifactIds: string[];
}
export interface AccountDocument {
  _id: string; datasetTag: string; isSynthetic: true; graphAccountId: string;
  contentHash: string; record: CrmAccountRecord;
}
export interface ArtifactDocument {
  _id: string; datasetTag: string; isSynthetic: true; accountId: string; sourceArtifactId: string;
  contentHash: string; record: Artifact;
}
export interface ExtractionDocument {
  _id: string; datasetTag: string; isSynthetic: true; inputHash: string;
  contentHash: string; record: IngestionRun;
}
export interface DatasetDocument {
  _id: string; datasetTag: string; isSynthetic: true; currentRunId: string; manifestHash: string;
}
export interface CrmStoredDataset {
  accounts: AccountDocument[]; artifacts: ArtifactDocument[];
  extractions: ExtractionDocument[]; datasets: DatasetDocument[];
}
export interface CrmPersistence { mode: 'cloud' | 'memory'; durable: boolean }

function manifest(data: Pick<CrmStoredDataset, 'accounts' | 'artifacts' | 'extractions'>) {
  const rows = <T extends { _id: string }>(values: T[]) => [...values].sort((a, b) => a._id.localeCompare(b._id));
  return crmHash({
    accounts: rows(data.accounts).map(row => ({ id: row._id, contentHash: row.contentHash })),
    artifacts: rows(data.artifacts).map(row => ({ id: row._id, accountId: row.accountId,
      contentHash: row.contentHash, recordHash: crmHash(row.record) })),
    extractions: rows(data.extractions).map(row => ({ id: row._id, contentHash: row.contentHash })),
  });
}

/** Build only the existing, explicitly bound fictional CRM dataset. No AI calls, generator or writes. */
export function buildCrmSeedDocuments() {
  const accepted = validateRun(bundled);
  const accountDocs: AccountDocument[] = accounts.map(account => {
    const binding = companyBindings.find(row => row.accountId === account.id);
    if (!binding) throw new Error('A CRM account needs an explicit existing-graph identity binding.');
    const accountArtifacts = artifacts.filter(row => row.accountId === account.id);
    const crm = accountArtifacts.find(row => row.source === 'salesforce');
    const record: CrmAccountRecord = { id: binding.companyId, name: account.name, industry: account.industry,
      description: account.description, graphAccountId: account.id,
      externalAccountId: crm?.metadata.Account ?? null, relationshipStatus: 'EXISTING_CUSTOMER',
      datasetTag: CRM_DATASET_TAG, isSynthetic: true, entities: structuredClone(entities.filter(row => row.accountId === account.id)),
      sourceArtifactIds: accountArtifacts.map(row => row.id) };
    return { _id: record.id, datasetTag: CRM_DATASET_TAG, isSynthetic: true,
      graphAccountId: account.id, record, contentHash: crmHash(record) };
  });
  const artifactDocs: ArtifactDocument[] = artifacts.map(original => {
    const record = structuredClone(original);
    const account = accountDocs.find(row => row.graphAccountId === record.accountId)!;
    return { _id: CRM_DATASET_TAG + ':' + record.id, datasetTag: CRM_DATASET_TAG, isSynthetic: true,
      accountId: account._id, sourceArtifactId: record.id, contentHash: artifactContentHash(record.content), record };
  });
  const extractionDocs: ExtractionDocument[] = [{ _id: accepted.id, datasetTag: CRM_DATASET_TAG,
    isSynthetic: true, inputHash: accepted.inputHash, contentHash: crmHash(accepted), record: accepted }];
  const data: CrmStoredDataset = { accounts: accountDocs, artifacts: artifactDocs, extractions: extractionDocs,
    datasets: [{ _id: CRM_DATASET_TAG, datasetTag: CRM_DATASET_TAG, isSynthetic: true,
      currentRunId: accepted.id, manifestHash: manifest({ accounts: accountDocs, artifacts: artifactDocs, extractions: extractionDocs }) }] };
  validateStoredCrmDataset(data);
  return { ...data, datasetTag: CRM_DATASET_TAG,
    collections: { crm_accounts: data.accounts, crm_artifacts: data.artifacts,
      crm_extractions: data.extractions, crm_datasets: data.datasets },
    counts: { accounts: data.accounts.length, artifacts: data.artifacts.length,
      extractions: data.extractions.length, facts: accepted.extraction.facts.length, ideas: accepted.extraction.ideas.length } };
}

/** Verify persisted source bytes and every accepted quote before projecting customer context. */
export function validateStoredCrmDataset(data: CrmStoredDataset): IngestionRun {
  const invalid = () => new AppError('The saved CRM sources or extraction do not match their accepted evidence. Re-import the CRM dataset.', 503, 'CRM_DATASET_INVALID');
  const pointer = data.datasets.find(row => row._id === CRM_DATASET_TAG);
  if (!pointer) throw new AppError('Import the CRM account dataset into Atlas before using cloud customer records.', 503, 'CRM_IMPORT_REQUIRED');
  const extraction = data.extractions.find(row => row._id === pointer.currentRunId);
  if (pointer.datasetTag !== CRM_DATASET_TAG || pointer.isSynthetic !== true || !extraction
    || extraction.datasetTag !== CRM_DATASET_TAG || extraction.isSynthetic !== true
    || extraction._id !== extraction.record.id || extraction.inputHash !== extraction.record.inputHash
    || extraction.contentHash !== crmHash(extraction.record)) throw invalid();
  let run: IngestionRun;
  try { run = validateRun(extraction.record); } catch { throw invalid(); }
  const seen = new Set<string>();
  for (const account of data.accounts) {
    if (seen.has(account._id) || account._id !== account.record.id || account.graphAccountId !== account.record.graphAccountId
      || !companyBindings.some(binding => binding.companyId === account._id && binding.accountId === account.graphAccountId)
      || account.contentHash !== crmHash(account.record) || account.datasetTag !== CRM_DATASET_TAG || account.isSynthetic !== true) throw invalid();
    seen.add(account._id);
  }
  const artifactIds = new Set<string>();
  for (const artifact of data.artifacts) {
    const account = data.accounts.find(row => row._id === artifact.accountId);
    if (!account || artifactIds.has(artifact.sourceArtifactId) || artifact.record.id !== artifact.sourceArtifactId
      || artifact.record.accountId !== account.graphAccountId || artifact.datasetTag !== CRM_DATASET_TAG
      || artifact.contentHash !== artifactContentHash(artifact.record.content) || artifact.isSynthetic !== true) throw invalid();
    artifactIds.add(artifact.sourceArtifactId);
  }
  for (const fact of run.extraction.facts) for (const evidence of fact.evidence) {
    const artifact = data.artifacts.find(row => row.sourceArtifactId === evidence.artifactId);
    if (!artifact || artifact.record.accountId !== fact.accountId || !artifact.record.content.includes(evidence.quote)) throw invalid();
  }
  if (data.accounts.length !== accounts.length || data.artifacts.length !== artifacts.length
    || pointer.manifestHash !== manifest({ ...data, extractions: [extraction] })) throw invalid();
  return run;
}
