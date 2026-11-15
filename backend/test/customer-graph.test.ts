import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'net';
import express from 'express';
import bundle from '../src/fixtures/customer-graph/terra-run.json';
import { artifacts, accounts } from '../src/customer-graph/fixtures';
import { validateExtraction, validateRun, extractWithTerra } from '../src/customer-graph/extract';
import { buildGraph } from '../src/customer-graph/graph';
import { createCustomerGraphRouter } from '../src/customer-graph/routes';
import { CustomerGraphStore } from '../src/customer-graph/store';
import { MODEL } from '../src/customer-graph/contracts';
import { AppError } from '../src/utils/errors';
import { companyBindings } from '../src/customer-graph/company-bindings';
import { disconnectNeo4j, getDriver, isNeo4jConnected } from '../src/integrations/neo4j/connection';
import { runQuery } from '../src/integrations/neo4j/graphService';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const run = validateRun(bundle);
test('the real saved Terra run covers every artifact and all seven source families per account', () => {
  assert.equal(run.model, MODEL);
  assert.ok(run.responseId.startsWith('resp_'));
  assert.equal(artifacts.length, 18);
  for (const account of accounts) assert.equal(new Set(artifacts.filter(a => a.accountId === account.id).map(a => a.source)).size, 7);
  assert.equal(new Set(run.extraction.facts.flatMap(f => f.evidence.map(e => e.artifactId))).size, artifacts.length);
  const conflict = run.extraction.facts.find(f => f.id === 'fact-meridian-term-conflict')!;
  assert.ok(conflict.evidence.some(e => e.artifactId === 'ml-crm'));
  assert.ok(conflict.evidence.some(e => e.artifactId === 'ml-contract'));
  assert.match(conflict.statement, /31 January 2027/);
  assert.match(conflict.statement, /28 February 2027/);
});

test('unsupported quotes, cross-account identities, invalid dates and invented idea links are rejected', () => {
  const invalid = (edit: (value: typeof run.extraction) => void) => {
    const extraction = structuredClone(run.extraction); edit(extraction); assert.throws(() => validateExtraction(extraction));
  };
  invalid(e => { e.facts[0].evidence[0].quote = 'A made-up customer commitment.'; });
  invalid(e => { e.facts[0].evidence[0].artifactId = 'hp-email'; });
  invalid(e => { e.facts[0].subjectId = 'harbour-alex'; });
  invalid(e => { e.facts[0].date = '2027-02-30'; });
  invalid(e => { e.facts[1].id = e.facts[0].id; });
  invalid(e => { e.ideas[0].factIds[0] = 'fact-invented'; });
  invalid(e => { e.ideas[0].accountId = 'harbour'; });
  invalid(e => { e.ideas[0].factIds = [e.ideas[0].factIds[0], e.ideas[0].factIds[0]]; });
  invalid(e => { e.facts = e.facts.filter(f => !f.evidence.some(r => r.artifactId === 'ml-crm')); });
});

test('Terra transport sends original artifacts to the exact requested model and rejects incomplete output', async () => {
  let called = false;
  const transport = (async (url: string, options: RequestInit) => {
    called = true; assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body as string);
    assert.equal(body.model, MODEL); assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.deepEqual(JSON.parse(body.input).artifacts, artifacts);
    return new Response(JSON.stringify({ id: 'resp-unit-test', model: MODEL, status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(run.extraction) }] }] }));
  }) as typeof fetch;
  const result = await extractWithTerra('sk-unit-test', transport);
  assert.ok(called); assert.deepEqual(result.extraction, run.extraction);
  const incomplete = (async () => new Response(JSON.stringify({ status: 'incomplete', output: [] }))) as typeof fetch;
  await assert.rejects(extractWithTerra('sk-unit-test', incomplete), e => e instanceof AppError && e.code === 'CUSTOMER_GRAPH_INVALID_EXTRACTION');
});

test('every idea has a complete graph path to exact source artifacts without cross-account edges', () => {
  const graph = buildGraph(run), ids = new Set(graph.nodes.map(n => n.id));
  assert.equal(ids.size, graph.nodes.length);
  assert.equal(new Set(graph.edges.map(e => e.id)).size, graph.edges.length);
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.from) && ids.has(edge.to));
    assert.equal(graph.nodes.find(n => n.id === edge.from)!.accountId, graph.nodes.find(n => n.id === edge.to)!.accountId);
  }
  for (const idea of run.extraction.ideas) {
    const connections = graph.edges.filter(e => e.from === idea.id && e.type === 'BASED_ON');
    assert.ok(connections.length >= 2);
    for (const connection of connections) assert.ok(graph.edges.some(e => e.from === connection.to && e.type === 'EVIDENCED_BY'));
  }
});

test('single-source ideas, wrong model/input versions, unknown objects and invalid business dates are rejected', () => {
  for (const patch of [{ model: 'gpt-4.1-mini' }, { inputHash: 'obsolete' }, { promptVersion: 'obsolete' }]) {
    assert.throws(() => validateRun({ ...run, ...patch }));
  }
  const singleSource = structuredClone(run.extraction);
  singleSource.ideas[0].factIds = singleSource.facts.filter(f => f.accountId === 'meridian' && f.evidence.every(e => e.artifactId === 'ml-contract')).slice(0, 2).map(f => f.id);
  assert.equal(singleSource.ideas[0].factIds.length, 2);
  assert.throws(() => validateExtraction(singleSource), /multiple source families/);
  for (const date of ['2026-02-29', '2026-13-01', '2026-04-31']) {
    const invalid = structuredClone(run.extraction); invalid.facts[0].date = date;
    assert.throws(() => validateExtraction(invalid));
  }
  const unknownObject = structuredClone(run.extraction); unknownObject.facts[0].objectId = 'unknown-person';
  assert.throws(() => validateExtraction(unknownObject), /unknown entity/);
});

test('refused, malformed and unsupported Terra output never becomes an accepted run', async () => {
  const invalid = structuredClone(run.extraction); invalid.facts[0].evidence[0].quote = 'A source passage that does not exist.';
  for (const output of [
    [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot process' }] }],
    [{ type: 'message', content: [{ type: 'output_text', text: '{invalid json' }] }],
    [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(invalid) }] }],
    [],
  ]) {
    const transport = (async () => new Response(JSON.stringify({ id: 'resp-invalid', model: MODEL, status: 'completed', output }))) as typeof fetch;
    await assert.rejects(extractWithTerra('sk-test-no-real-key', transport), e => e instanceof AppError && e.code === 'CUSTOMER_GRAPH_INVALID_EXTRACTION');
  }
});

const mockSnapshot = () => ({ run, graph: buildGraph(run), storage: { mode: 'local' as const, synced: false, configured: false, message: 'Test snapshot' } });
async function withRouter(extract: typeof extractWithTerra, work: (root: string) => Promise<void>, save = async () => mockSnapshot()) {
  const app = express(); app.use(express.json()); app.use('/customer-graph', createCustomerGraphRouter({ read: async () => mockSnapshot(), sync: async () => mockSnapshot(), save }, extract));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  try { await work(`http://127.0.0.1:${(server.address() as AddressInfo).port}/customer-graph`); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
const post = (url: string, body: unknown = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('concurrent ingestion is rejected while reads remain available and only one run is saved', async () => {
  const previousKey = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'sk-concurrency-test';
  let release!: () => void, started!: () => void, saves = 0;
  const gate = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { started = resolve; });
  try {
    await withRouter(async () => { started(); await gate; return run; }, async root => {
      const first = post(`${root}/ingest`);
      try {
        await entered;
        const second = await post(`${root}/ingest`); assert.equal(second.status, 409);
        const current = await (await fetch(root)).json() as any;
        assert.equal(current.ingesting, true); assert.equal(current.run.id, run.id);
      } finally { release(); }
      assert.equal((await first).status, 200);
      assert.equal(saves, 1);
      assert.equal(((await (await fetch(root)).json()) as any).ingesting, false);
    }, async () => { saves++; return mockSnapshot(); });
  } finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});

test('missing keys, production mutation gates and ingestion rate limits preserve read access', async () => {
  const previous = { key: process.env.OPENAI_API_KEY, mode: process.env.NODE_ENV, controls: process.env.ENABLE_DEMO_CONTROLS };
  try {
    process.env.OPENAI_API_KEY = '';
    await withRouter(async () => { throw new Error('No provider request is allowed without a key'); }, async root => {
      assert.equal(((await (await fetch(root)).json()) as any).ingestionConfigured, false);
      const response = await post(`${root}/ingest`); assert.equal(response.status, 503);
      assert.equal(((await response.json()) as any).code, 'CUSTOMER_GRAPH_KEY_REQUIRED');
    });
    process.env.NODE_ENV = 'production'; delete process.env.ENABLE_DEMO_CONTROLS;
    await withRouter(async () => run, async root => {
      assert.equal((await fetch(root)).status, 200);
      assert.equal((await post(`${root}/ingest`)).status, 403);
      assert.equal((await post(`${root}/sync`)).status, 403);
    });
    process.env.NODE_ENV = 'test'; process.env.OPENAI_API_KEY = 'sk-rate-limit-test';
    await withRouter(async () => run, async root => {
      for (let i = 0; i < 3; i++) assert.equal((await post(`${root}/ingest`)).status, 200);
      assert.equal((await post(`${root}/ingest`)).status, 429);
      assert.equal((await fetch(root)).status, 200);
    });
  } finally {
    for (const [key, value] of Object.entries({ OPENAI_API_KEY: previous.key, NODE_ENV: previous.mode, ENABLE_DEMO_CONTROLS: previous.controls })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('database outage and missing shared configuration show an honest replay and never use a private fallback', async () => {
  const execute = promisify(execFile);
  const script = `const {CustomerGraphStore}=require('./dist/customer-graph/store');const {disconnectNeo4j}=require('./dist/integrations/neo4j/connection');
    (async()=>{const s=new CustomerGraphStore();const before=await s.read();let code=null;try{await s.sync()}catch(e){code=e.code}const after=await s.read();
    console.log(JSON.stringify({storage:before.storage,code,preserved:before.run.id===after.run.id}));await disconnectNeo4j()})().catch(()=>process.exit(1));`;
  for (const uri of ['', 'bolt://127.0.0.1:1']) {
    const { stdout } = await execute(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), timeout: 20000,
      env: { ...process.env, NEO4J_URI: uri, NEO4J_PASSWORD: uri ? 'test-invalid-password' : '', DB_CONNECTION_TIMEOUT_MS: '1000',
        CUSTOMER_GRAPH_STATE_PATH: path.join(__dirname, 'missing-state.json'), CUSTOMER_GRAPH_NEO4J_URI: 'bolt://127.0.0.1:7687',
        CUSTOMER_GRAPH_NEO4J_PASSWORD: 'should-never-be-used', LOCAL_DEMO_MODE: 'true' } });
    const result = JSON.parse(stdout.trim().split('\n').at(-1)!);
    assert.equal(result.storage.mode, 'local'); assert.equal(result.storage.synced, false); assert.equal(result.preserved, true);
    assert.equal(result.storage.configured, !!uri);
    assert.equal(result.code, uri ? 'AURA_CONNECTION_FAILED' : 'CUSTOMER_GRAPH_GRAPH_NOT_CONFIGURED');
  }
});

test('HTTP exposes readable/downloadable originals and preserves the previous graph on provider failure', async () => {
  const snapshot = { run, graph: buildGraph(run), storage: { mode: 'local' as const, synced: false, configured: false, message: 'Test snapshot' } };
  const store = { read: async () => snapshot, save: async () => { throw new Error('Must not commit a failed extraction'); }, sync: async () => snapshot };
  const app = express(); app.use(express.json()); app.use('/customer-graph', createCustomerGraphRouter(store, async () => { throw new AppError('Provider unavailable', 503); }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/customer-graph`;
  const previousKey = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'sk-unit-test-do-not-expose';
  try {
    const first = await (await fetch(root)).json() as any;
    assert.equal(first.artifacts.length, 18); assert.equal(first.graph.nodes.length, buildGraph(run).nodes.length);
    assert.equal(JSON.stringify(first).includes(process.env.OPENAI_API_KEY!), false);
    for (const artifact of artifacts) {
      const response = await fetch(`${root}/artifacts/${artifact.id}/download`);
      assert.equal(response.status, 200); assert.equal(await response.text(), artifact.content);
      assert.ok(response.headers.get('content-disposition')?.includes(artifact.filename));
    }
    assert.equal((await fetch(`${root}/artifacts/missing/download`)).status, 404);
    const post = (data: unknown) => fetch(`${root}/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    assert.equal((await post({ model: 'wrong-model' })).status, 400);
    assert.equal((await post({})).status, 503);
    const after = await (await fetch(root)).json() as any;
    assert.equal(after.run.id, run.id); assert.equal(after.ingesting, false);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('customer context shares the existing driver and Company records, preserves properties and syncs idempotently', { skip: process.env.CUSTOMER_GRAPH_TEST_NEO4J !== 'true' }, async () => {
  const store = new CustomerGraphStore();
  let previousName: string | null = null;
  const companyId = companyBindings[0].companyId;
  try {
    const first = await store.read(); assert.equal(first.storage.mode, 'neo4j'); assert.ok(first.run);
    assert.equal(isNeo4jConnected(), true);
    const driver = getDriver();
    await store.sync();
    const company = await runQuery('MATCH(c:Company {companyId:$companyId}) RETURN c.companyName AS name', { companyId });
    assert.equal(company.records.length, 1);
    previousName = company.records[0].get('name');
    await runQuery('MATCH(c:Company {companyId:$companyId}) SET c.companyName=$name', { companyId, name: 'Existing company name must survive context sync' });
    const synced = await store.sync(), again = await store.sync();
    assert.equal(getDriver(), driver);
    assert.equal(again.storage.synced, true); assert.equal(again.run!.id, first.run!.id);
    assert.equal(again.storage.linkedCompanies, 2);
    assert.equal(again.graph.nodes.length, synced.graph.nodes.length); assert.equal(again.graph.edges.length, synced.graph.edges.length);
    const linked = await runQuery(`MATCH(c:Company)-[:HAS_CUSTOMER_CONTEXT {active:true}]->(a:CustomerGraphNode {runId:$runId})
      <-[:FOR_ACCOUNT]-(idea:CustomerGraphNode {kind:'Idea'})-[:BASED_ON]->(fact)-[:EVIDENCED_BY]->(artifact)
      RETURN c.companyId AS companyId, c.companyName AS name, count(DISTINCT fact) AS facts`, { runId: again.run!.id });
    assert.equal(linked.records.length, 2);
    assert.equal(linked.records.find(r => r.get('companyId') === companyId)!.get('name'), 'Existing company name must survive context sync');
    assert.ok(linked.records.every(r => r.get('facts').toNumber() > 0));
    await new CustomerGraphStore().read();
    assert.equal(getDriver(), driver);
  } finally {
    if (previousName !== null) await runQuery('MATCH(c:Company {companyId:$companyId}) SET c.companyName=$name', { companyId, name: previousName });
    await disconnectNeo4j();
  }
});

test('same-count corrupted graph payload is rejected and recovers after repair', { skip: process.env.CUSTOMER_GRAPH_TEST_NEO4J !== 'true' }, async () => {
  const store = new CustomerGraphStore(); let uid: string | null = null, original: string | null = null;
  try {
    const before = await store.read(); assert.equal(before.storage.synced, true);
    const row = await runQuery('MATCH(n:CustomerGraphNode {runId:$runId, kind:"Fact"}) RETURN n.uid AS uid, n.payload AS payload LIMIT 1', { runId: before.run!.id });
    uid = row.records[0].get('uid'); original = row.records[0].get('payload');
    const changed = JSON.parse(original!); changed.record.statement = 'An unsupported statement inserted into the stored projection.';
    await runQuery('MATCH(n:CustomerGraphNode {uid:$uid}) SET n.payload=$payload', { uid, payload: JSON.stringify(changed) });
    const degraded = await store.read();
    assert.equal(degraded.storage.mode, 'local'); assert.equal(degraded.storage.synced, false);
    assert.equal(degraded.run!.id, before.run!.id);
    assert.equal(JSON.stringify(degraded.graph).includes(changed.record.statement), false);
    const recovered = await store.sync();
    assert.equal(recovered.storage.synced, true);
    assert.equal(JSON.stringify(recovered.graph).includes(changed.record.statement), false);
  } finally {
    if (uid && original) await runQuery('MATCH(n:CustomerGraphNode {uid:$uid}) SET n.payload=$payload', { uid, payload: original });
    const repaired = await store.read(); assert.equal(repaired.storage.synced, true);
    await disconnectNeo4j();
  }
});

test('accepted ingestion runs cannot be overwritten under the same run ID', { skip: process.env.CUSTOMER_GRAPH_TEST_NEO4J !== 'true' }, async () => {
  const store = new CustomerGraphStore(), before = await store.read();
  try {
    const changed = structuredClone(before.run!); changed.extraction.facts[0].title = 'Changed title under an existing run ID';
    await assert.rejects(store.save(changed), e => e instanceof AppError && e.code === 'CUSTOMER_GRAPH_IMMUTABLE_RUN');
    assert.deepEqual((await store.read()).run, before.run);
  } finally { await store.save(before.run!); await disconnectNeo4j(); }
});

test('a failure after graph writes rolls the entire transaction back', { skip: process.env.CUSTOMER_GRAPH_TEST_NEO4J !== 'true' }, async () => {
  const store = new CustomerGraphStore(), before = await store.read(), driver = getDriver();
  const attempt = { ...structuredClone(before.run!), id: `cg-rollback-test-${randomUUID()}` };
  const originalSession = driver.session.bind(driver);
  driver.session = ((...args: Parameters<typeof driver.session>) => {
    const session = originalSession(...args), executeWrite = session.executeWrite.bind(session);
    session.executeWrite = ((work: any) => executeWrite(tx => work(new Proxy(tx, {
      get(target, property) {
        if (property === 'run') return (query: string, params: any) => {
          if (query.includes('SET d.currentRunId')) throw new Error('Injected failure immediately before graph activation');
          return target.run(query, params);
        };
        return Reflect.get(target, property);
      },
    })))) as typeof session.executeWrite;
    return session;
  }) as typeof driver.session;
  try {
    await assert.rejects(store.save(attempt), e => e instanceof AppError && e.code === 'CUSTOMER_GRAPH_GRAPH_COMMIT_FAILED');
  } finally { driver.session = originalSession; }
  try {
    const after = await store.read(); assert.equal(after.storage.synced, true); assert.deepEqual(after.run, before.run);
    const abandoned = await runQuery('OPTIONAL MATCH(r:CustomerGraphIngestion {id:$id}) WITH count(r) AS runs OPTIONAL MATCH(n:CustomerGraphNode {runId:$id}) RETURN runs, count(n) AS nodes', { id: attempt.id });
    assert.equal(abandoned.records[0].get('runs').toNumber(), 0); assert.equal(abandoned.records[0].get('nodes').toNumber(), 0);
  } finally { await disconnectNeo4j(); }
});

test('parallel syncs share one driver and leave one active context per canonical company', { skip: process.env.CUSTOMER_GRAPH_TEST_NEO4J !== 'true' }, async () => {
  const store = new CustomerGraphStore(), before = await store.read();
  const driver = getDriver();
  try {
    const results = await Promise.all(Array.from({ length: 6 }, () => new CustomerGraphStore().sync()));
    assert.equal(getDriver(), driver);
    for (const result of results) {
      assert.equal(result.run!.id, before.run!.id); assert.equal(result.storage.synced, true);
      assert.equal(result.graph.nodes.length, before.graph.nodes.length); assert.equal(result.graph.edges.length, before.graph.edges.length);
    }
    const active = await runQuery('MATCH(c:Company)-[r:HAS_CUSTOMER_CONTEXT {active:true}]->(a:CustomerGraphNode) RETURN c.companyId AS companyId, count(r) AS contexts');
    for (const binding of companyBindings) assert.equal(active.records.find(r => r.get('companyId') === binding.companyId)!.get('contexts').toNumber(), 1);
  } finally { await disconnectNeo4j(); }
});

test('stored relationship endpoints must match their accepted evidence, even when payload and counts match', { skip: process.env.CUSTOMER_GRAPH_TEST_NEO4J !== 'true' }, async () => {
  const store = new CustomerGraphStore(), before = await store.read();
  let edge: { from: string; to: string; wrongTo: string; uid: string; properties: Record<string, unknown> } | null = null;
  const replace = async (target: string) => {
    await runQuery(`MATCH (f:CustomerGraphNode {uid:$from}), (a:CustomerGraphNode {uid:$to})
      MATCH (f)-[r:EVIDENCED_BY {uid:$uid}]->() DELETE r
      CREATE (f)-[replacement:EVIDENCED_BY]->(a) SET replacement=$properties`, { from: edge!.from, to: target, uid: edge!.uid, properties: edge!.properties });
  };
  try {
    const found = await runQuery(`MATCH (f:CustomerGraphNode {runId:$runId})-[r:EVIDENCED_BY]->(a)
      MATCH (wrong:CustomerGraphNode {runId:$runId, kind:'Artifact'}) WHERE wrong.accountId<>f.accountId
      RETURN f.uid AS from, a.uid AS to, wrong.uid AS wrongTo, r.uid AS uid, properties(r) AS properties LIMIT 1`, { runId: before.run!.id });
    const row = found.records[0];
    edge = { from: row.get('from'), to: row.get('to'), wrongTo: row.get('wrongTo'), uid: row.get('uid'), properties: row.get('properties') };
    await replace(edge.wrongTo);
    const degraded = await store.read(); assert.equal(degraded.storage.mode, 'local'); assert.equal(degraded.storage.synced, false);
  } finally {
    if (edge) await replace(edge.to);
    assert.equal((await store.read()).storage.synced, true);
    await disconnectNeo4j();
  }
});
