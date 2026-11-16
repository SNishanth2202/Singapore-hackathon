import { mongo } from 'mongoose';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { buildCrmPortfolio, CRM_SOURCE_COLLECTIONS, CrmPortfolioSnapshot, CrmSourceData } from './portfolio';

export async function readCrmSource(uri: string, database?: string): Promise<{ data: CrmSourceData; database: string }> {
  const client = new mongo.MongoClient(uri, { serverSelectionTimeoutMS: 12000, connectTimeoutMS: 8000, socketTimeoutMS: 20000, maxPoolSize: 2, readPreference: 'secondaryPreferred' });
  try {
    await client.connect();
    const db = database ? client.db(database) : client.db();
    const data = {} as CrmSourceData;
    for (const name of CRM_SOURCE_COLLECTIONS) {
      data[name] = [];
      for await (const row of db.collection(name).find({}, { projection: { _id: 0 }, maxTimeMS: 20000 }).batchSize(500)) data[name].push(row);
    }
    return { data, database: db.databaseName };
  } finally { await client.close(); }
}

export async function writePortfolioView(filename: string, snapshot: CrmPortfolioSnapshot) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = filename + '.tmp';
  await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
  await rename(temporary, filename);
}
export function validatePortfolioView(value: unknown): CrmPortfolioSnapshot {
  const data = value as CrmPortfolioSnapshot;
  if (!data || data.schemaVersion !== 1 || !data.source || !data.metrics || !Array.isArray(data.accounts) || !data.details || !Number.isFinite(Date.parse(data.refreshedAt)) || !/^\d{4}-\d{2}$/.test(data.reportingMonth) || data.metrics.accounts !== data.accounts.length) throw new AppError('The saved CRM view needs to be refreshed.', 503, 'CRM_VIEW_INVALID');
  const ids = new Set<string>();
  for (const account of data.accounts) {
    if (!account.id || ids.has(account.id) || !data.details[account.id] || data.details[account.id].account.id !== account.id) throw new AppError('The saved CRM view has inconsistent account references.', 503, 'CRM_VIEW_INVALID');
    ids.add(account.id);
  }
  return data;
}

export function createPortfolioStore(options: { uri?: string; database?: string; cachePath?: string; savedViewOnly?: boolean; ttlMs?: number; now?: () => Date; read?: typeof readCrmSource } = {}) {
  let cached: CrmPortfolioSnapshot | undefined, loadedAt = 0, inflight: Promise<CrmPortfolioSnapshot> | undefined;
  const now = options.now ?? (() => new Date());
  async function load(): Promise<CrmPortfolioSnapshot> {
    if (options.savedViewOnly) {
      if (!options.cachePath) throw new AppError('No saved CRM view is configured.', 503, 'CRM_VIEW_NOT_CONFIGURED');
      try { return validatePortfolioView(JSON.parse(await readFile(options.cachePath, 'utf8'))); }
      catch (error) { if (error instanceof AppError) throw error; throw new AppError('The saved CRM view could not be loaded.', 503, 'CRM_VIEW_UNAVAILABLE'); }
    }
    if (!options.uri) throw new AppError('The CRM source is not connected.', 404, 'CRM_SOURCE_NOT_CONFIGURED');
    try {
      const source = await (options.read ?? readCrmSource)(options.uri, options.database);
      const snapshot = buildCrmPortfolio(source.data, { now: now(), database: source.database });
      if (options.cachePath) await writePortfolioView(options.cachePath, snapshot);
      return snapshot;
    } catch (error) {
      if (error instanceof AppError) throw error;
      // Do not expose connection strings, credentials or database-driver diagnostics.
      throw new AppError('CRM records could not be refreshed. Retry the connection.', 503, 'CRM_SOURCE_UNAVAILABLE');
    }
  }
  return {
    async get(refresh = false) {
      if (!refresh && cached && Date.now() - loadedAt < (options.ttlMs ?? 15 * 60000)) return cached;
      if (!inflight) inflight = load().then(snapshot => { cached = snapshot; loadedAt = Date.now(); return snapshot; }).finally(() => { inflight = undefined; });
      return inflight;
    },
    mode: options.savedViewOnly ? 'saved' as const : 'connected' as const,
  };
}
export const portfolioStore = createPortfolioStore({ uri: env.CRM_SOURCE_MONGODB_URI, database: env.CRM_SOURCE_DB_NAME, cachePath: env.CRM_PORTFOLIO_CACHE_PATH, savedViewOnly: env.CRM_SOURCE_USE_SAVED_VIEW });
