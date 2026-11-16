import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { env } from '../config/env';
import { requireCloudMongo } from '../models/CloudStorage';
import { initialState, State } from './contracts';
const schema = new mongoose.Schema({ _id: String, state: mongoose.Schema.Types.Mixed, leaseUntil: Date, token: String }, { bufferCommands: false, collection: 'prospecting_jobs' });
const Model = mongoose.models.ProspectingJob || mongoose.model('ProspectingJob', schema);
export interface JobStore {
    read(): Promise<State>;
    claim(): Promise<string | null>;
    write(state: State, token: string): Promise<boolean>;
    release(token: string): Promise<void>;
}
export function memoryJobStore(): JobStore { let state = initialState(), token: string | null = null; return { async read() { return structuredClone(state); }, async claim() { if (token)
        return null; return token = randomUUID(); }, async write(next, t) { if (t !== token)
        return false; state = structuredClone(next); return true; }, async release(t) { if (t === token)
        token = null; } }; }
export const jobStore: JobStore = env.STORAGE_MODE === 'memory' ? memoryJobStore() : {
    async read() {
        requireCloudMongo();
        const row = await Model.findById('active').select('state').lean<{ state: State }>();
        return row?.state ?? initialState();
    },
    async claim() {
        requireCloudMongo();
        await Model.updateOne({ _id: 'active' }, { $setOnInsert: { state: initialState(), leaseUntil: new Date(0) } }, { upsert: true });
        const token = randomUUID();
        const result = await Model.updateOne({ _id: 'active', leaseUntil: { $lte: new Date() } },
            { $set: { token, leaseUntil: new Date(Date.now() + 600000) } });
        return result.matchedCount ? token : null;
    },
    async write(state, token) { return (await Model.updateOne({ _id: 'active', token, leaseUntil: { $gt: new Date() } }, { $set: { state } })).matchedCount === 1; },
    async release(token) { await Model.updateOne({ _id: 'active', token }, { $set: { leaseUntil: new Date(0) }, $unset: { token: 1 } }); },
};
