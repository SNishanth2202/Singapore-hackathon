import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import seed from './singtel.seed.json';
import { BusinessKnowledge, KnowledgeSchema } from './schema';
import { AppError } from '../utils/errors';

export function getSeedKnowledge(): BusinessKnowledge { return KnowledgeSchema.parse(structuredClone(seed)); }

/** File-backed for the local prototype. The interface can later use a database. */
export function createKnowledgeStore(directory = path.resolve(__dirname, '..', '..', 'data', 'business')) {
  const currentPath = path.join(directory, 'current.json');
  let writing = false;
  async function read(): Promise<BusinessKnowledge> {
    try { return KnowledgeSchema.parse(JSON.parse(await fs.readFile(currentPath, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return getSeedKnowledge();
      // Never silently replace broken saved business rules with different rules.
      throw new AppError('Saved business knowledge is invalid or unreadable. Restore a valid configuration.', 503, 'KNOWLEDGE_UNAVAILABLE');
    }
  }
  async function update(expectedVersion: number, input: unknown): Promise<BusinessKnowledge> {
    if (writing) throw new AppError('Business knowledge is being saved. Reload and retry.', 409, 'KNOWLEDGE_CONFLICT');
    writing = true;
    let temporaryPath: string | undefined;
    try {
      const current = await read();
      if (expectedVersion !== current.version) throw new AppError('Business knowledge changed. Reload before saving your edits.', 409, 'KNOWLEDGE_CONFLICT');
      const proposed = KnowledgeSchema.parse(input);
      if (proposed.version !== expectedVersion) throw new AppError('Configuration version does not match expectedVersion.', 400, 'VALIDATION_ERROR');
      const next = KnowledgeSchema.parse({ ...proposed, version: current.version + 1, updatedAt: new Date().toISOString() });
      await fs.mkdir(path.join(directory, 'versions'), { recursive: true });
      // Archive each distinct snapshot; configuration history contains no credentials.
      for (const snapshot of [current, next]) {
        const archive = path.join(directory, 'versions', `${snapshot.version}-${randomUUID()}.json`);
        await fs.writeFile(archive, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
      }
      temporaryPath = path.join(directory, `current-${randomUUID()}.tmp`);
      await fs.writeFile(temporaryPath, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' });
      await fs.rename(temporaryPath, currentPath);
      return next;
    } finally {
      if (temporaryPath) await fs.unlink(temporaryPath).catch(() => undefined);
      writing = false;
    }
  }
  return { read, update };
}

export const businessKnowledgeStore = createKnowledgeStore();
