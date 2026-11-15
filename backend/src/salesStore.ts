import { env } from './config/env';
import { SalesActivity, ISalesActivity } from './models/SalesActivity';
import { requireCloudMongo } from './models/CloudStorage';
import { AppError } from './utils/errors';

const memoryEvents: ISalesActivity[] = [];
const bodyKey = (event: Partial<ISalesActivity>) => {
  const value = event as Partial<ISalesActivity> & { _id?: unknown; __v?: unknown };
  const { createdAt: _createdAt, _id: _mongoId, __v: _version, ...stable } = value;
  return JSON.stringify(stable);
};

export async function findActivityById(eventId: string): Promise<ISalesActivity | null> {
  if (env.STORAGE_MODE === 'memory') return structuredClone(memoryEvents.find(event => event.eventId === eventId) ?? null);
  requireCloudMongo();
  return await SalesActivity.findOne({ eventId }).lean() as ISalesActivity | null;
}

export async function appendActivity(event: ISalesActivity): Promise<ISalesActivity> {
  const existing = await findActivityById(event.eventId);
  if (existing) {
    if (bodyKey(existing) !== bodyKey(event)) throw new AppError('Event ID was already used with different data.', 409, 'EVENT_ID_CONFLICT');
    return existing;
  }
  if (env.STORAGE_MODE === 'memory') { memoryEvents.push(structuredClone(event)); return event; }
  requireCloudMongo();
  try { return (await SalesActivity.create(event)).toObject() as ISalesActivity; }
  catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const raced = await findActivityById(event.eventId);
      if (raced && bodyKey(raced) === bodyKey(event)) return raced;
    }
    throw error;
  }
}

/** Atomically reserve a stable event ID. Used for delivery attempts to prevent two workers sending twice. */
export async function claimActivity(event: ISalesActivity): Promise<{ claimed: boolean; event: ISalesActivity }> {
  if (env.STORAGE_MODE === 'memory') {
    const existing = memoryEvents.find(row => row.eventId === event.eventId);
    if (existing) return { claimed: false, event: structuredClone(existing) };
    memoryEvents.push(structuredClone(event));
    return { claimed: true, event };
  }
  requireCloudMongo();
  try { return { claimed: true, event: (await SalesActivity.create(event)).toObject() as ISalesActivity }; }
  catch (error) {
    if ((error as { code?: number }).code === 11000) return { claimed: false, event: (await findActivityById(event.eventId))! };
    throw error;
  }
}

export async function findCompanyActivities(companyId: string): Promise<ISalesActivity[]> {
  if (env.STORAGE_MODE === 'memory') return structuredClone(memoryEvents.filter(event => event.companyId === companyId).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)));
  requireCloudMongo();
  return await SalesActivity.find({ companyId }).sort({ createdAt: 1 }).lean() as ISalesActivity[];
}

export async function findInterventions(filters: { status?: string; priority?: string; reason?: string; assignedTo?: string; page: number; limit: number }) {
  if (env.STORAGE_MODE === 'memory') {
    const latest = new Map<string, ISalesActivity>();
    for (const event of memoryEvents) if (event.type === 'INTERVENTION_CREATED' || event.type === 'INTERVENTION_UPDATED') latest.set(String(event.payload.interventionId), event);
    const all = [...latest.values()].filter(e => (!filters.status || e.status === filters.status) && (!filters.priority || e.priority === filters.priority) && (!filters.reason || e.reason === filters.reason) && (!filters.assignedTo || e.assignedTo === filters.assignedTo));
    return { data: structuredClone(all.slice((filters.page - 1) * filters.limit, filters.page * filters.limit)), total: all.length };
  }
  requireCloudMongo();
  const match: Record<string, unknown> = { type: { $in: ['INTERVENTION_CREATED', 'INTERVENTION_UPDATED'] } };
  const filtersAfterLatest: Record<string, unknown> = {};
  for (const key of ['status', 'priority', 'reason', 'assignedTo'] as const) if (filters[key]) filtersAfterLatest[key] = filters[key];
  const pipeline: any[] = [
    { $match: match }, { $sort: { createdAt: 1 } },
    { $group: { _id: '$payload.interventionId', event: { $last: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$event' } }, ...(Object.keys(filtersAfterLatest).length ? [{ $match: filtersAfterLatest }] : []),
    { $sort: { createdAt: -1 } },
    { $facet: { data: [{ $skip: (filters.page - 1) * filters.limit }, { $limit: filters.limit }], total: [{ $count: 'count' }] } },
  ];
  const [result] = await SalesActivity.aggregate(pipeline);
  return { data: result?.data ?? [], total: result?.total?.[0]?.count ?? 0 };
}

export async function listDiscoveredCompanies(page = 1, limit = 25) {
  if (env.STORAGE_MODE === 'memory') {
    const latest = new Map<string, ISalesActivity>();
    for (const event of memoryEvents) if (event.type === 'DISCOVERED') {
      const prior = latest.get(event.companyId);
      if (!prior || new Date(event.createdAt) > new Date(prior.createdAt)) latest.set(event.companyId, event);
    }
    const rows = [...latest.values()].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return { data: structuredClone(rows.slice((page - 1) * limit, page * limit)), total: rows.length };
  }
  requireCloudMongo();
  const pipeline: any[] = [
    { $match: { type: 'DISCOVERED' } }, { $sort: { createdAt: -1 } },
    { $group: { _id: '$companyId', event: { $first: '$$ROOT' } } }, { $replaceRoot: { newRoot: '$event' } },
    { $sort: { createdAt: -1 } }, { $facet: { data: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'count' }] } },
  ];
  const [result] = await SalesActivity.aggregate(pipeline);
  return { data: result?.data ?? [], total: result?.total?.[0]?.count ?? 0 };
}

export async function allActivityEvents() {
  if (env.STORAGE_MODE === 'memory') return structuredClone(memoryEvents);
  requireCloudMongo();
  return await SalesActivity.find().lean() as ISalesActivity[];
}

export async function findEmailSuppression(email: string): Promise<ISalesActivity | null> {
  const normalized = email.trim().toLowerCase();
  if (env.STORAGE_MODE === 'memory') {
    return structuredClone(memoryEvents.find(event => event.type === 'SUPPRESSION_ADDED' && event.contactEmail?.toLowerCase() === normalized) ?? null);
  }
  requireCloudMongo();
  return await SalesActivity.findOne({ type: 'SUPPRESSION_ADDED', contactEmail: normalized }).lean() as ISalesActivity | null;
}

export function clearMemoryActivities() { memoryEvents.length = 0; }
