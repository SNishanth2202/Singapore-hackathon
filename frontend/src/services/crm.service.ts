import api from './api'
import type { Artifact, Fact, Idea } from './customer-graph.service'

export interface CrmAccount {
  id: string; name: string; industry: string; description: string; graphAccountId: string
  isSynthetic: boolean; datasetTag: string; relationshipStatus: 'EXISTING_CUSTOMER'
  counts: { artifacts: number; facts: number; contacts: number; contracts: number; invoices: number; risks: number; opportunities: number; actions: number }
}
export interface CrmEntity { id: string; name?: string; title?: string; description: string; facts: Fact[]; artifactIds?: string[] }
export interface CrmArtifact extends Artifact { contentHash: string; downloadPath: string }
export interface CrmPersistence { mode: 'cloud' | 'memory'; durable: boolean }
export interface CrmDetail {
  account: CrmAccount; contacts: CrmEntity[]; contracts: CrmEntity[]; invoices: CrmEntity[]; usage: Fact[]; support: CrmEntity[]
  risks: Idea[]; opportunities: Idea[]; actions: Idea[]; facts: Fact[]; artifacts: CrmArtifact[]
  extraction: { id: string; model: string; createdAt: string; promptVersion: string }; persistence: CrmPersistence
}
export const crmService = {
  async accounts(signal?: AbortSignal): Promise<{ accounts: CrmAccount[]; persistence: CrmPersistence }> {
    const response = await api.get('/api/v1/crm/accounts', { signal })
    if (!Array.isArray(response.data?.data?.accounts)) throw new Error('Customer accounts could not be read. Please retry.')
    return response.data.data
  },
  async account(id: string, signal?: AbortSignal): Promise<CrmDetail> {
    const response = await api.get('/api/v1/crm/accounts/' + encodeURIComponent(id), { signal })
    if (!response.data?.data?.account) throw new Error('This customer account could not be read. Please retry.')
    return response.data.data
  },
  artifactUrl(path: string) { return (api.defaults.baseURL ?? '').replace(/\/$/, '') + path },
}
