import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { AnalysisRun, requireCloudMongo } from '../../models/CloudStorage';
import { AppError } from '../../utils/errors';

export interface SavedAnalysis { id: string; companyId: string; createdAt: string; result: Record<string, unknown> }
const previews = new Map<string, SavedAnalysis>();
export function validAnalysisId(id: string): boolean { return /^analysis-[0-9a-f-]{36}$/.test(id); }

/** Restore a private local-session report with its original ID; never writes to cloud storage. */
export function restoreMemoryAnalysis(value: SavedAnalysis): SavedAnalysis {
  if (env.STORAGE_MODE !== 'memory') throw new AppError('Session restoration is only available in memory storage.', 409, 'MEMORY_RESTORE_ONLY');
  if (!value || !validAnalysisId(value.id) || typeof value.companyId !== 'string' || !value.companyId.trim() || value.companyId.length > 100
    || !Number.isFinite(Date.parse(value.createdAt)) || !value.result || typeof value.result !== 'object' || Array.isArray(value.result)
    || (value.result.analysisId !== undefined && value.result.analysisId !== value.id)) {
    throw new AppError('Invalid saved analysis in the session backup.', 400, 'INVALID_SESSION_BACKUP');
  }
  const record = structuredClone({ ...value, result: { ...value.result, analysisId: value.id, persistence: { mode: 'memory', durable: false } } });
  const existing = previews.get(record.id);
  if (existing && JSON.stringify(existing) !== JSON.stringify(record)) throw new AppError('A saved analysis ID has different content.', 409, 'ANALYSIS_ID_CONFLICT');
  if (!existing && previews.size >= 100) previews.delete(previews.keys().next().value!);
  previews.set(record.id, record);
  return structuredClone(record);
}

export async function saveAnalysis(companyId: string, result: Record<string, unknown>) {
  const id = `analysis-${randomUUID()}`;
  const persisted = { ...result, analysisId: id, persistence: { mode: env.STORAGE_MODE, durable: env.STORAGE_MODE === 'cloud' } };
  if (env.STORAGE_MODE === 'memory') {
    if (previews.size >= 100) previews.delete(previews.keys().next().value!);
    previews.set(id, { id, companyId, createdAt: new Date().toISOString(), result: structuredClone(persisted) });
  } else {
    requireCloudMongo();
    const context = result.businessContext as { knowledgeVersion?: number } | undefined;
    await AnalysisRun.create({ _id: id, companyId, knowledgeVersion: context?.knowledgeVersion ?? 0, result: persisted });
  }
  return persisted;
}
export async function latestAnalysis(companyId: string): Promise<SavedAnalysis | null> {
  if (env.STORAGE_MODE === 'memory') return structuredClone([...previews.values()].reverse().find(r => r.companyId === companyId) ?? null);
  requireCloudMongo();
  const row = await AnalysisRun.findOne({ companyId }).sort({ createdAt: -1, _id: -1 }).lean();
  return row ? { id: row._id, companyId: row.companyId, createdAt: row.createdAt.toISOString(), result: row.result } : null;
}
export async function loadAnalysis(id: string): Promise<SavedAnalysis> {
  if (!validAnalysisId(id)) throw new AppError('Analysis not found.', 404, 'NOT_FOUND');
  if (env.STORAGE_MODE === 'memory') {
    const run = previews.get(id);
    if (!run) throw new AppError('Analysis not found.', 404, 'NOT_FOUND');
    return structuredClone(run);
  }
  requireCloudMongo();
  const row = await AnalysisRun.findById(id).lean();
  if (!row) throw new AppError('Analysis not found.', 404, 'NOT_FOUND');
  return { id: row._id, companyId: row.companyId, createdAt: row.createdAt.toISOString(), result: row.result };
}
