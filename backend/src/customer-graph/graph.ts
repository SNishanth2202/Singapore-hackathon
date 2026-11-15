import { artifacts, entities } from './fixtures';
import { CustomerGraph, GraphEdge, IngestionRun } from './contracts';

export function buildGraph(run: IngestionRun | null): CustomerGraph {
  if (!run) return { nodes: [], edges: [] };
  const nodes: CustomerGraph['nodes'] = [
    ...entities.map(e => ({ id: e.id, kind: e.kind, label: e.label, accountId: e.accountId, record: e })),
    ...artifacts.map(a => ({ id: a.id, kind: 'Artifact', label: a.title, accountId: a.accountId, record: a })),
    ...run.extraction.facts.map(f => ({ id: f.id, kind: 'Fact', label: f.title, accountId: f.accountId, record: f })),
    ...run.extraction.ideas.map(i => ({ id: i.id, kind: 'Idea', label: i.title, accountId: i.accountId, record: i })),
  ];
  const edges: GraphEdge[] = [];
  const link = (from: string, to: string, type: GraphEdge['type']) => {
    const id = `${from}:${type}:${to}`;
    if (!edges.some(e => e.id === id)) edges.push({ id, from, to, type });
  };
  for (const entity of entities) if (entity.kind !== 'Account') link(entity.id, entity.accountId, 'BELONGS_TO');
  for (const artifact of artifacts) link(artifact.id, artifact.accountId, 'BELONGS_TO');
  for (const fact of run.extraction.facts) {
    link(fact.id, fact.accountId, 'FOR_ACCOUNT'); link(fact.id, fact.subjectId, 'ABOUT');
    if (fact.objectId) link(fact.id, fact.objectId, 'REFERS_TO');
    for (const evidence of fact.evidence) link(fact.id, evidence.artifactId, 'EVIDENCED_BY');
  }
  for (const idea of run.extraction.ideas) {
    link(idea.id, idea.accountId, 'FOR_ACCOUNT');
    for (const factId of idea.factIds) link(idea.id, factId, 'BASED_ON');
  }
  return { nodes, edges };
}
