import type { ResearchRecord } from '../research/store';
import { buildResearchOverview } from '../research/events';
import { getDriver } from './connection';
import { env } from '../../config/env';

export function researchGraphData(record: ResearchRecord) {
  const overview = buildResearchOverview(record);
  const sourceIds = new Set(record.sources.map(source => source.id));
  return {
    snapshotId: record.id, companyId: record.company.entityId, name: record.company.name,
    description: record.company.description, website: record.company.website, createdAt: record.createdAt,
    sources: record.sources.map(source => ({
      id: `${record.id}:${source.id}`, evidenceId: source.id, title: source.title, url: source.url,
      publisher: source.publisher, contentHash: source.contentHash, kind: source.kind,
      verification: source.verification, publishedAt: source.publishedAt, retrievedAt: source.retrievedAt,
    })),
    events: overview.events.map(event => ({
      id: `${record.id}:${event.id}`, title: event.title, eventType: event.eventType,
      verification: event.verification, publishedAt: event.publishedAt, businessRole: event.businessRole,
      sourceIds: event.sourceIds.filter(id => sourceIds.has(id)).map(id => `${record.id}:${id}`),
    })),
  };
}

export async function projectResearch(record: ResearchRecord): Promise<void> {
  const data = researchGraphData(record);
  const session = getDriver().session({ database: env.NEO4J_DATABASE });
  try {
    // A retry merges the same snapshot-scoped IDs; no duplicate nodes or partial projections.
    await session.executeWrite(async tx => {
      await tx.run(`MERGE (c:Company {companyId: $companyId})
        SET c.companyName = $name, c.website = $website, c.description = $description
        MERGE (s:ResearchSnapshot {id: $snapshotId}) SET s.createdAt = $createdAt
        MERGE (c)-[:HAS_RESEARCH]->(s)`, data);
      await tx.run(`MATCH (s:ResearchSnapshot {id: $snapshotId})
        UNWIND $sources AS source
        MERGE (e:EvidenceSource {id: source.id}) SET e += source
        MERGE (s)-[:CITES]->(e)`, data);
      await tx.run(`MATCH (s:ResearchSnapshot {id: $snapshotId})
        UNWIND $events AS event
        MERGE (b:BusinessEvent {id: event.id})
        SET b.title = event.title, b.eventType = event.eventType, b.verification = event.verification,
            b.publishedAt = event.publishedAt, b.businessRole = event.businessRole
        MERGE (s)-[:REPORTS_EVENT]->(b)
        WITH b, event UNWIND event.sourceIds AS sourceId
        MATCH (e:EvidenceSource {id: sourceId}) MERGE (b)-[:SUPPORTED_BY]->(e)`, data);
    }, { timeout: 20000 });
  } finally { await session.close(); }
}

export interface GraphNode { id: string; type: string; label: string; properties: Record<string, unknown> }
export interface GraphEdge { id: string; source: string; target: string; type: string }

/** Render the same provenance relationships for an isolated in-memory workspace. */
export function previewResearchGraph(record: ResearchRecord): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const data = researchGraphData(record);
  const nodes: GraphNode[] = [
    { id: data.companyId, type: 'Company', label: data.name,
      properties: { companyId: data.companyId, companyName: data.name, website: data.website, description: data.description } },
    { id: data.snapshotId, type: 'ResearchSnapshot', label: 'Research snapshot',
      properties: { id: data.snapshotId, createdAt: data.createdAt } },
    ...data.sources.map(source => ({ id: source.id, type: 'EvidenceSource', label: source.title, properties: { ...source } })),
    ...data.events.map(event => ({ id: event.id, type: 'BusinessEvent', label: event.title, properties: { ...event } })),
  ];
  const edge = (source: string, target: string, type: string): GraphEdge => ({ id: `${source}:${type}:${target}`, source, target, type });
  const edges = [edge(data.companyId, data.snapshotId, 'HAS_RESEARCH'),
    ...data.sources.map(source => edge(data.snapshotId, source.id, 'CITES')),
    ...data.events.flatMap(event => [edge(data.snapshotId, event.id, 'REPORTS_EVENT'),
      ...event.sourceIds.map(sourceId => edge(event.id, sourceId, 'SUPPORTED_BY'))]),
  ];
  return { nodes, edges };
}

export async function readResearchGraph(researchId?: string) {
  const session = getDriver().session({ database: env.NEO4J_DATABASE, defaultAccessMode: 'READ' });
  try {
    const result = await session.executeRead(tx => tx.run(`
      MATCH (c:Company)-[:HAS_RESEARCH]->(s:ResearchSnapshot)
      WHERE $researchId IS NULL OR s.id = $researchId
      WITH c, s ORDER BY s.createdAt DESC LIMIT 1
      OPTIONAL MATCH (s)-[:CITES|REPORTS_EVENT]->(item)
      WITH c, s, collect(item) AS items
      WITH [c, s] + items AS nodes
      UNWIND nodes AS n
      OPTIONAL MATCH (n)-[r:HAS_RESEARCH|CITES|REPORTS_EVENT|SUPPORTED_BY]->(target)
      WHERE target IN nodes
      RETURN collect(DISTINCT n) AS nodes, collect(DISTINCT r) AS edges`, { researchId: researchId ?? null }));
    const record = result.records[0];
    if (!record) return { nodes: [], edges: [] };
    const key = (node: any) => String(node.properties.id ?? node.properties.companyId);
    const nodes: GraphNode[] = record.get('nodes').map((node: any) => ({
      id: key(node), type: node.labels[0], label: String(node.properties.companyName ?? node.properties.title ?? 'Research snapshot'),
      properties: node.properties,
    }));
    const identities = new Map(record.get('nodes').map((node: any) => [node.elementId, key(node)]));
    const edges: GraphEdge[] = record.get('edges').map((edge: any) => ({
      id: edge.elementId, source: identities.get(edge.startNodeElementId), target: identities.get(edge.endNodeElementId), type: edge.type,
    }));
    return { nodes, edges };
  } finally { await session.close(); }
}
