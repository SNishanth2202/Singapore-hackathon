import api from './api'

export type SourceKind = 'salesforce' | 'calls' | 'email_calendar' | 'support' | 'contracts' | 'billing' | 'services_usage'
export interface Artifact { id: string; accountId: string; source: SourceKind; format: string; title: string; occurredAt: string; filename: string; metadata: Record<string, string>; content: string; synthetic: true }
export interface Entity { id: string; accountId: string; kind: string; label: string; description: string }
export interface Fact { id: string; accountId: string; subjectId: string; objectId: string | null; category: string; title: string; statement: string; value: string | null; date: string | null; evidence: { artifactId: string; quote: string }[] }
export interface Idea { id: string; accountId: string; kind: string; title: string; rationale: string; nextAction: string; priority: string; factIds: string[] }
export interface GraphNode { id: string; kind: string; label: string; accountId: string; record: Entity | Artifact | Fact | Idea }
export interface GraphEdge { id: string; from: string; to: string; type: string }
export interface CustomerGraphSnapshot {
  accounts: { id: string; name: string; industry: string; initials: string; description: string }[]
  artifacts: Artifact[]; entities: Entity[]; graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  run: { id: string; model: string; createdAt: string; responseId: string; totalTokens: number | null; extraction: { facts: Fact[]; ideas: Idea[] } } | null
  storage: { mode: 'neo4j' | 'local'; synced: boolean; configured: boolean; message: string; linkedCompanies?: number }
  synthetic: true; asOf: string; model: string; ingestionConfigured: boolean; ingesting: boolean
}
const endpoint = '/api/v1/customer-graph'
export async function customerSnapshot(action?: 'ingest' | 'sync'): Promise<CustomerGraphSnapshot> {
  const response = action ? await api.post(`${endpoint}/${action}`, {}, { timeout: 120000 }) : await api.get(endpoint)
  return response.data
}
export async function downloadArtifact(artifact: Artifact) {
  const { data } = await api.get(`${endpoint}/artifacts/${artifact.id}/download`, { responseType: 'blob' })
  const url = URL.createObjectURL(data), link = document.createElement('a')
  link.href = url; link.download = artifact.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
