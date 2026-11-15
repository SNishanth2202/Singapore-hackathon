import { AppError } from '../../utils/errors';
import { env } from '../../config/env';
import mongoose from 'mongoose';
import { CompanyProfile, ResearchSnapshot, requireCloudMongo } from '../../models/CloudStorage';

export interface CompanyIdentity {
  entityId: string; name: string; description: string; website: string | null;
  wikipediaTitle: string | null; aliases: string[]; identitySource: string;
}
export interface ResearchSource {
  id: string; kind: 'company_profile' | 'official_page' | 'news_headline';
  title: string; url: string; publisher: string; excerpt: string;
  publishedAt: string | null; retrievedAt: string; contentHash: string;
  verification: 'retrieved_profile' | 'retrieved_official_page' | 'headline_only';
}
export interface ResearchRecord {
  id: string; company: CompanyIdentity; sources: ResearchSource[]; warnings: string[]; createdAt: string;
  quality?: import('./events').ResearchOverview;
  persistence?: { mode: 'cloud' | 'memory'; durable: boolean };
}
const previewRecords = new Map<string, ResearchRecord>();
export function validResearchId(id: string): boolean { return /^research-[0-9a-f-]{36}$/.test(id); }
export async function saveResearch(record: ResearchRecord) {
  if (!validResearchId(record.id)) throw new AppError('Invalid research ID.', 400, 'VALIDATION_ERROR');
  record.persistence = { mode: env.STORAGE_MODE, durable: env.STORAGE_MODE === 'cloud' };
  if (env.STORAGE_MODE === 'memory') {
    // Bounded, explicitly temporary sample preview; never silently used by cloud startup.
    if (previewRecords.size >= 100) previewRecords.delete(previewRecords.keys().next().value!);
    previewRecords.set(record.id, structuredClone(record));
    return;
  }
  requireCloudMongo();
  // The immutable snapshot and pending graph-sync state are committed in one MongoDB insert.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await ResearchSnapshot.create([{ _id: record.id, entityId: record.company.entityId, record,
        graphStatus: 'PENDING', graphAttempts: 0, graphRetryAt: new Date(), graphLeaseUntil: new Date(0) }], { session });
      await CompanyProfile.updateOne({ _id: record.company.entityId }, { $set: {
        identity: record.company, latestResearchId: record.id, researchedAt: new Date(record.createdAt),
      } }, { upsert: true, session });
    });
  } finally { await session.endSession(); }
}
export async function loadResearch(id: string): Promise<ResearchRecord> {
  if (!validResearchId(id)) throw new AppError('Research not found.', 404, 'NOT_FOUND');
  let record: ResearchRecord | undefined;
  if (env.STORAGE_MODE === 'memory') record = previewRecords.get(id);
  else { requireCloudMongo(); record = (await ResearchSnapshot.findById(id).lean())?.record as ResearchRecord | undefined; }
  if (!record || record.id !== id || !Array.isArray(record.sources)) throw new AppError('Research not found. Search for the company again.', 404, 'NOT_FOUND');
  return structuredClone(record);
}
export async function listResearch(limit = 25) {
  limit = Math.max(1, Math.min(100, Math.trunc(limit) || 25));
  if (env.STORAGE_MODE === 'memory') return [...previewRecords.values()].reverse().slice(0, limit).map(({ id, company, createdAt, persistence }) => ({ id, company, createdAt, persistence, graphStatus: 'NOT_CONNECTED' }));
  requireCloudMongo();
  return (await ResearchSnapshot.find().sort({ createdAt: -1 }).limit(limit).select('record.id record.company record.createdAt record.persistence graphStatus').lean())
    .map(row => ({ id: row.record.id, company: row.record.company, createdAt: row.record.createdAt, persistence: row.record.persistence, graphStatus: row.graphStatus }));
}
