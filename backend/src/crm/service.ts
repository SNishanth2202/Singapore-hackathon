import { AppError } from '../utils/errors';
import { Entity, Fact } from '../customer-graph/contracts';
import { CrmPersistence, CrmStoredDataset, validateStoredCrmDataset } from './dataset';
import { readCrmDataset } from './store';

export function projectCrmAccount(data: CrmStoredDataset, id: string, persistence: CrmPersistence) {
  const run = validateStoredCrmDataset(data);
  const saved = data.accounts.find(row => row._id === id || row.graphAccountId === id);
  if (!saved) throw new AppError('CRM account not found.', 404, 'CRM_ACCOUNT_NOT_FOUND');
  const { entities, sourceArtifactIds: _sourceIds, ...account } = saved.record;
  const graphId = saved.graphAccountId;
  const artifacts = data.artifacts.filter(row => row.accountId === saved._id).map(row => ({
    ...row.record, contentHash: row.contentHash,
    downloadPath: '/api/v1/crm/accounts/' + encodeURIComponent(saved._id) + '/artifacts/' + encodeURIComponent(row.sourceArtifactId),
  }));
  const facts = run.extraction.facts.filter(row => row.accountId === graphId);
  const ideas = run.extraction.ideas.filter(row => row.accountId === graphId);
  const referencedBy = (fact: Fact, entity: Entity) => fact.subjectId === entity.id || fact.objectId === entity.id;
  const entityGroup = (kind: Entity['kind'], source: string) => entities.filter(entity => entity.kind === kind).map(entity => {
    const relevant = facts.filter(fact => referencedBy(fact, entity) || fact.evidence.some(ref => artifacts.some(a => a.id === ref.artifactId && a.source === source)));
    return { id: entity.id, title: entity.label, description: entity.description, facts: relevant,
      artifactIds: [...new Set(relevant.flatMap(fact => fact.evidence.map(ref => ref.artifactId)))] };
  });
  const contacts = entities.filter(entity => entity.kind === 'Person').map(entity => ({
    id: entity.id, name: entity.label, description: entity.description, facts: facts.filter(fact => referencedBy(fact, entity)),
  }));
  const contracts = entityGroup('Contract', 'contracts'), invoices = entityGroup('Invoice', 'billing'), support = entityGroup('Ticket', 'support');
  const usage = facts.filter(fact => fact.category === 'usage' || fact.evidence.some(ref => artifacts.some(a => a.id === ref.artifactId && a.source === 'services_usage')));
  const risks = ideas.filter(row => row.kind === 'risk'), opportunities = ideas.filter(row => row.kind === 'opportunity'), actions = ideas.filter(row => row.kind === 'action');
  return { account: { ...account, counts: { artifacts: artifacts.length, facts: facts.length, contacts: contacts.length,
    contracts: contracts.length, invoices: invoices.length, risks: risks.length, opportunities: opportunities.length, actions: actions.length } },
    contacts, contracts, invoices, usage, support, risks, opportunities, actions, facts, artifacts,
    extraction: { id: run.id, model: run.model, createdAt: run.createdAt, promptVersion: run.promptVersion, inputHash: run.inputHash },
    persistence, provenance: 'Illustrative existing-customer records; source passages and commercial values are not actual Singtel CRM data.' };
}

export function createCrmService(read = readCrmDataset) {
  return {
    async list() {
      const { data, persistence } = await read();
      return { accounts: data.accounts.map(row => projectCrmAccount(data, row._id, persistence).account), persistence };
    },
    async detail(id: string) {
      const { data, persistence } = await read();
      return projectCrmAccount(data, id, persistence);
    },
  };
}
export const crmService = createCrmService();
