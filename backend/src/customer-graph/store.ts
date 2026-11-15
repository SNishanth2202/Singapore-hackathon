import fs from 'fs';
import path from 'path';
import { isDeepStrictEqual } from 'util';
import neo4j from 'neo4j-driver';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { REPO_ROOT } from '../ranking/seed';
import bundled from '../fixtures/customer-graph/terra-run.json';
import { CustomerGraph, DATASET_ID, GraphEdge, IngestionRun } from './contracts';
import { validateRun } from './extract';
import { buildGraph } from './graph';
import { connectNeo4j, getDriver } from '../integrations/neo4j/connection';
import { applyConstraints } from '../integrations/neo4j/graphService';
import { companyBindings } from './company-bindings';

export interface GraphStorage { mode: 'neo4j' | 'local'; synced: boolean; configured: boolean; message: string; linkedCompanies?: number; }
export class CustomerGraphStore {
  private schemaReady: Promise<void> | null = null;
  private run: IngestionRun | null = null;
  private file = process.env.CUSTOMER_GRAPH_STATE_PATH || path.join(REPO_ROOT, '.local/customer-graph-run.json');
  constructor() {
    try { this.run = validateRun(bundled); } catch { /* No bundled model run yet. */ }
    if (fs.existsSync(this.file)) {
      try { this.run = validateRun(JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch { /* Keep the valid bundled run if the cache is obsolete. */ }
    }
  }
  private configured() { return !!(env.NEO4J_URI && env.NEO4J_PASSWORD); }
  private async connection() {
    if (!this.configured()) throw new AppError('Configure the app’s existing NEO4J_* connection to sync customer context into its graph.', 503, 'CUSTOMER_GRAPH_GRAPH_NOT_CONFIGURED');
    await connectNeo4j();
    if (!this.schemaReady) this.schemaReady = applyConstraints().catch(error => { this.schemaReady = null; throw error; });
    await this.schemaReady;
    return getDriver();
  }
  private cache(run: IngestionRun) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(run, null, 2), 'utf8'); fs.renameSync(temporary, this.file);
    } catch { /* A successful graph commit remains authoritative if the optional local cache cannot be written. */ }
    this.run = run;
  }
  async read(): Promise<{ run: IngestionRun | null; graph: CustomerGraph; storage: GraphStorage }> {
    try {
      const driver = await this.connection(), session = driver.session({ database: env.NEO4J_DATABASE, defaultAccessMode: neo4j.session.READ });
      try {
        const saved = await session.executeRead(async tx => {
          const result = await tx.run('MATCH (d:CustomerGraphDataset {id:$id}) MATCH (r:CustomerGraphIngestion {id:d.currentRunId}) RETURN r.payload AS payload', { id: DATASET_ID });
          if (!result.records.length) return null;
          const run = validateRun(JSON.parse(result.records[0].get('payload')));
          const nodes = await tx.run('MATCH (n:CustomerGraphNode {runId:$runId}) RETURN n.uid AS uid, n.id AS id, n.kind AS kind, n.label AS label, n.accountId AS accountId, n.payload AS payload', { runId: run.id });
          const edges = await tx.run('MATCH (a:CustomerGraphNode {runId:$runId})-[r]->(b:CustomerGraphNode {runId:$runId}) RETURN a.id AS fromId, b.id AS toId, type(r) AS relationType, r.uid AS uid, r.payload AS payload', { runId: run.id });
          const graph: CustomerGraph = {
            nodes: nodes.records.map(row => {
              const node = JSON.parse(row.get('payload'));
              if (row.get('uid') !== `${run.id}::${node.id}` || ['id', 'kind', 'label', 'accountId'].some(key => row.get(key) !== node[key])) {
                throw new Error('Stored node identity differs from its accepted projection');
              }
              return node;
            }),
            edges: edges.records.map(row => {
              const edge = JSON.parse(row.get('payload'));
              if (row.get('uid') !== `${run.id}::${edge.id}` || row.get('fromId') !== edge.from || row.get('toId') !== edge.to || row.get('relationType') !== edge.type) {
                throw new Error('Stored relationship differs from its accepted evidence');
              }
              return edge;
            }),
          };
          const expected = buildGraph(run);
          if (graph.nodes.length !== expected.nodes.length || graph.edges.length !== expected.edges.length
            || !isDeepStrictEqual(new Map(graph.nodes.map(n => [n.id, n])), new Map(expected.nodes.map(n => [n.id, n])))
            || !isDeepStrictEqual(new Map(graph.edges.map(e => [e.id, e])), new Map(expected.edges.map(e => [e.id, e])))) {
            throw new Error('Graph snapshot differs from its accepted evidence');
          }
          const links = await tx.run('MATCH (c:Company)-[r:HAS_CUSTOMER_CONTEXT {datasetId:$id, active:true}]->(a:CustomerGraphNode {runId:$runId, kind:"Account"}) RETURN c.companyId AS companyId, a.id AS accountId', { id: DATASET_ID, runId: run.id });
          const linkedCompanies = companyBindings.filter(binding => links.records.some(row => row.get('companyId') === binding.companyId && row.get('accountId') === binding.accountId)).length;
          return { run, graph, linkedCompanies };
        });
        if (saved) {
          this.run = saved.run;
          return { run: saved.run, graph: saved.graph, storage: { mode: 'neo4j', synced: saved.linkedCompanies === companyBindings.length, configured: true,
            linkedCompanies: saved.linkedCompanies, message: saved.linkedCompanies === companyBindings.length ? 'Read from the existing Neo4j graph; linked to canonical Company records.' : 'Saved extraction needs syncing to the existing Company graph.' } };
        }
        return { run: this.run, graph: buildGraph(this.run), storage: { mode: 'local', synced: false, configured: true, message: 'Saved model run. Sync to populate the central Neo4j graph.' } };
      } finally { await session.close(); }
    } catch (error) {
      return { run: this.run, graph: buildGraph(this.run), storage: { mode: 'local', synced: false, configured: this.configured(),
        message: error instanceof AppError ? error.message : 'Central graph could not be read. Showing the last saved model run.' } };
    }
  }
  async save(run: IngestionRun) {
    validateRun(run);
    // A graph commit is required when configured; failures never replace the previous active run.
    if (this.configured()) {
      const driver = await this.connection(), session = driver.session({ database: env.NEO4J_DATABASE });
      const graph = buildGraph(run);
      try {
        await session.executeWrite(async tx => {
          // Lock the dataset before checking immutable run identity and publishing a generation.
          await tx.run('MERGE (d:CustomerGraphDataset {id:$datasetId}) SET d.updatedAt=$at', { datasetId: DATASET_ID, at: run.createdAt });
          const existing = await tx.run('MATCH(r:CustomerGraphIngestion {id:$runId}) RETURN r.payload AS payload', { runId: run.id });
          if (existing.records.length && !isDeepStrictEqual(JSON.parse(existing.records[0].get('payload')), run)) {
            throw new AppError('Accepted ingestion runs are immutable. Create a new ingestion run to change its content.', 409, 'CUSTOMER_GRAPH_IMMUTABLE_RUN');
          }
          await tx.run('MATCH (d:CustomerGraphDataset {id:$datasetId}) MERGE (r:CustomerGraphIngestion {id:$runId}) ON CREATE SET r.payload=$payload MERGE (d)-[:HAS_RUN]->(r)',
            { datasetId: DATASET_ID, runId: run.id, payload: JSON.stringify(run) });
          await tx.run('UNWIND $rows AS row MERGE (n:CustomerGraphNode {uid:row.uid}) SET n += row', {
            rows: graph.nodes.map(n => ({ uid: `${run.id}::${n.id}`, id: n.id, runId: run.id, datasetId: DATASET_ID, accountId: n.accountId, kind: n.kind, label: n.label, payload: JSON.stringify(n) })),
          });
          const types: GraphEdge['type'][] = ['BELONGS_TO', 'ABOUT', 'REFERS_TO', 'EVIDENCED_BY', 'BASED_ON', 'FOR_ACCOUNT'];
          for (const type of types) {
            await tx.run(`UNWIND $rows AS row MATCH (a:CustomerGraphNode {uid:row.fromUid}), (b:CustomerGraphNode {uid:row.toUid}) MERGE (a)-[r:${type} {uid:row.uid}]->(b) SET r.payload=row.payload`, {
              rows: graph.edges.filter(e => e.type === type).map(e => ({ uid: `${run.id}::${e.id}`, fromUid: `${run.id}::${e.from}`, toUid: `${run.id}::${e.to}`, payload: JSON.stringify(e) })),
            });
          }
          // Extend the existing canonical Company graph. Preserve all properties of existing companies.
          await tx.run(`UNWIND $bindings AS binding
            MERGE (c:Company {companyId:binding.companyId})
            ON CREATE SET c.companyName=binding.companyName, c.country=binding.country,
              c.industry=binding.industry, c.companyStage='CUSTOMER', c.isMockData=true
            MERGE (country:Country {name:binding.country})
            MERGE (industry:Industry {name:binding.industry})
            MERGE (c)-[:OPERATES_IN]->(country) MERGE (c)-[:BELONGS_TO]->(industry)
            WITH c, binding
            MATCH (a) WHERE (a:CustomerGraphNode OR a:Customer360Node) AND a.kind='Account'
              AND a.id=binding.accountId AND a.datasetId IN [$datasetId, 'customer360-demo-v1']
            MERGE (a)-[:REPRESENTS]->(c)
            MERGE (c)-[context:HAS_CUSTOMER_CONTEXT {datasetId:a.datasetId}]->(a)
            SET context.active=(a.runId=$runId AND a.datasetId=$datasetId)`,
            { bindings: companyBindings, datasetId: DATASET_ID, runId: run.id });
          await tx.run('MATCH (d:CustomerGraphDataset {id:$datasetId}) SET d.currentRunId=$runId', { datasetId: DATASET_ID, runId: run.id });
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('The customer graph could not be committed. The previous active graph was preserved. Retry sync.', 503, 'CUSTOMER_GRAPH_GRAPH_COMMIT_FAILED');
      }
      finally { await session.close(); }
    }
    this.cache(run);
    return this.read();
  }
  async sync() {
    await this.read();
    if (!this.run) throw new AppError('Ingest the artifacts before syncing a graph.', 409, 'CUSTOMER_GRAPH_NOT_INGESTED');
    if (!this.configured()) throw new AppError('Configure the app’s existing NEO4J_* connection before syncing customer context.', 503, 'CUSTOMER_GRAPH_GRAPH_NOT_CONFIGURED');
    return this.save(this.run);
  }
}
