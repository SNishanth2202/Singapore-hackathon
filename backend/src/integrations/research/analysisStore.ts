import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { AnalysisRun, requireCloudMongo } from '../../models/CloudStorage';
import { AppError } from '../../utils/errors';

interface SavedAnalysis { id: string; companyId: string; createdAt: string; result: Record<string, unknown> }
const previews = new Map<string, SavedAnalysis>();
export function validAnalysisId(id: string): boolean { return /^analysis-[0-9a-f-]{36}$/.test(id); }

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
