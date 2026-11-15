import mongoose from 'mongoose';
import seed from './singtel.seed.json';
import { BusinessKnowledge, KnowledgeSchema } from './schema';
import { AppError } from '../utils/errors';
import { env } from '../config/env';
import { BusinessProfile, BusinessKnowledgeVersion, requireCloudMongo } from '../models/CloudStorage';

export function getSeedKnowledge(): BusinessKnowledge { return KnowledgeSchema.parse(structuredClone(seed)); }
export interface KnowledgeRepository {
  read(): Promise<unknown | null>;
  initialize(initial: BusinessKnowledge): Promise<unknown>;
  compareAndSwap(version: number, next: BusinessKnowledge): Promise<boolean>;
}
export function createMemoryKnowledgeRepository(): KnowledgeRepository {
  let current: BusinessKnowledge | null = null;
  return {
    async read() { return structuredClone(current); },
    async initialize(initial) { if (!current) current = structuredClone(initial); return structuredClone(current); },
    async compareAndSwap(version, next) {
      if (!current || current.version !== version) return false;
      current = structuredClone(next); return true;
    },
  };
}
export function createMongoKnowledgeRepository(): KnowledgeRepository {
  return {
    async read() {
      requireCloudMongo();
      return (await BusinessProfile.findById('active').lean())?.knowledge ?? null;
    },
    async initialize(initial) {
      requireCloudMongo();
      const session = await mongoose.startSession();
      let value: unknown;
      try {
        await session.withTransaction(async () => {
          const existing = await BusinessProfile.findById('active').session(session).lean();
          if (existing) { value = existing.knowledge; return; }
          await BusinessProfile.create([{ _id: 'active', version: initial.version, knowledge: initial }], { session });
          await BusinessKnowledgeVersion.create([{ _id: initial.version, knowledge: initial }], { session });
          value = initial;
        });
        return value;
      } finally { await session.endSession(); }
    },
    async compareAndSwap(version, next) {
      requireCloudMongo();
      const session = await mongoose.startSession();
      let changed = false;
      try {
        await session.withTransaction(async () => {
          changed = false;
          const updated = await BusinessProfile.findOneAndUpdate({ _id: 'active', version },
            { $set: { version: next.version, knowledge: next } }, { new: true, session }).lean();
          if (!updated) return;
          await BusinessKnowledgeVersion.create([{ _id: next.version, knowledge: next }], { session });
          changed = true;
        });
        return changed;
      } finally { await session.endSession(); }
    },
  };
}
export function createKnowledgeStore(repository: KnowledgeRepository) {
  function validated(value: unknown): BusinessKnowledge {
    const parsed = KnowledgeSchema.safeParse(value);
    if (!parsed.success) throw new AppError('Saved business knowledge is invalid. Restore a valid configuration.', 503, 'KNOWLEDGE_UNAVAILABLE');
    return parsed.data;
  }
  async function initialize(initial = getSeedKnowledge()): Promise<BusinessKnowledge> {
    return validated(await repository.initialize(KnowledgeSchema.parse(initial)));
  }
  async function read(): Promise<BusinessKnowledge> {
    const current = await repository.read();
    return current === null ? initialize() : validated(current);
  }
  async function update(expectedVersion: number, input: unknown): Promise<BusinessKnowledge> {
    const current = await read();
    if (expectedVersion !== current.version) throw new AppError('Business knowledge changed. Reload before saving your edits.', 409, 'KNOWLEDGE_CONFLICT');
    const proposed = KnowledgeSchema.parse(input);
    if (proposed.version !== expectedVersion) throw new AppError('Configuration version does not match expectedVersion.', 400, 'VALIDATION_ERROR');
    const next = KnowledgeSchema.parse({ ...proposed, version: current.version + 1, updatedAt: new Date().toISOString() });
    if (!await repository.compareAndSwap(expectedVersion, next)) throw new AppError('Business knowledge changed. Reload before saving your edits.', 409, 'KNOWLEDGE_CONFLICT');
    return next;
  }
  return { initialize, read, update };
}
export const businessKnowledgeStore = createKnowledgeStore(env.STORAGE_MODE === 'memory' ? createMemoryKnowledgeRepository() : createMongoKnowledgeRepository());
