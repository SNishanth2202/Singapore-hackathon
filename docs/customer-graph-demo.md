# Central Customer Graph Database demo

See the [thorough test report](customer-graph-test-report.md) for verified coverage, fixes and final shared-graph audit.

This view adds seven customer source families to the application's existing Neo4j knowledge graph. It uses
the existing shared connection and canonical `Company` records; it does not create another database or graph service.
The two demo customers are entirely fictional. The view is reachable at
`/graph`, with the interactive graph at the center of the existing Knowledge Graph page. The previous `/customer-graph` URL redirects there, preserving its query parameters. It does not change the prospect queue's customer-exclusion policy.

## Show the demo

1. Use the application's existing Neo4j instance and configure its shared `NEO4J_URI`, `NEO4J_USERNAME`,
   `NEO4J_PASSWORD` and `NEO4J_DATABASE` settings. For local development this is the repository's existing
   Compose `neo4j` service. There are no customer-specific connection settings or fallback database.
2. Run `npm run dev` and open http://localhost:3000/graph.
3. Explore all connections across Meridian Logistics and Harbour Precision in the graph. Select a node to inspect its relationships and evidence.
4. Open **Source artifacts** to inspect or download the actual mock email, calendar invitation, call transcript,
   Salesforce export, support ticket, contract, invoice, service inventory and usage report. Each account has
   nine artifacts across seven source families; eighteen artifacts in total.
5. In **Intelligence**, open a source citation. Its exact passage is highlighted in the original artifact.
6. Open an idea's connected facts. In the graph, select a fact and follow its quoted evidence back
   to the original artifact. Graph nodes support keyboard activation; the canvas scrolls and supports zoom.
7. **Re-ingest with GPT-6.1 Terra** sends all eighteen artifacts to the real OpenAI Responses API, validates
   its structured output and commits a new graph snapshot. This uses the backend `OPENAI_API_KEY` and incurs
   API usage. The model is pinned to `gpt-6.1-terra`, independently of `OPENAI_MODEL` used by lead ranking.

The first actual model run produced 40 facts and 7 ideas, represented by 82 nodes and 223 edges.
It is bundled in `backend/src/fixtures/customer-graph/terra-run.json`, with the real model name, response ID,
timestamp, input hash, prompt version and token count. This is a replay of a real model extraction over mock
inputs, not a hand-authored response labelled as a model result. Counts may change on subsequent runs.

## Stories to demonstrate

- **Meridian:** the signed contract ends in January, while the CRM says February. The model connects the
  conflict to the non-renewal notice deadline. An open packet-loss incident blocks the Tuas expansion.
  The email requires a genuinely independent backup route and makes clear that the budget is not approved.
  An outstanding invoice amount is a disputed one-off charge, not an unpaid recurring service charge.
- **Harbour:** high utilization, image-upload slowdowns and a new production line justify a capacity assessment.
  They do not prove that a particular upgrade will fix the issue. An upcoming audit motivates continuity
  planning; the proposed solution, delivery date and budget still require validation and approval.

## Storage and evidence

Artifacts and a canonical mock entity catalog live in `backend/src/customer-graph/fixtures.ts`.
The model extracts facts and ideas using catalog IDs. Each fact references its account, subject, optional
object, category, value, date and literal source quotes. Every artifact must be cited. Ideas must reference
at least two distinct facts spanning at least two source families from the same account.

Validation rejects unknown entities, invented quotes, cross-account references, impossible dates, duplicate IDs,
uncovered artifacts and unsupported idea links. These checks validate attribution and structure; semantic
interpretations and proposed ideas still need human review.

The existing graph is extended with source provenance and immutable extraction runs:

```text
CustomerGraphDataset --HAS_RUN--> CustomerGraphIngestion
Company --OPERATES_IN--> Country
Company --BELONGS_TO--> Industry
Company --HAS_CUSTOMER_CONTEXT {active:true}--> Account
Account --REPRESENTS--> Company
Artifact --BELONGS_TO--> Account
Person / Site / Service / Contract / Ticket / Invoice --BELONGS_TO--> Account
Fact --FOR_ACCOUNT--> Account
Fact --ABOUT / REFERS_TO--> catalog entity
Fact --EVIDENCED_BY--> Artifact
Idea --FOR_ACCOUNT--> Account
Idea --BASED_ON--> Fact
```

The `Company`, `Country` and `Industry` nodes use the existing graph schema. Mock account bindings in
`backend/src/customer-graph/company-bindings.ts` explicitly map the fixture account IDs to reserved mock
`Company.companyId` values. Real connectors must supply verified existing company IDs. Company identities
are never guessed by the model or merged by display name. Existing company properties are preserved.

The immutable context projections have the `CustomerGraphNode` label and a `kind` property. These are
provenance records connected to their canonical company, not a separate customer identity store.
Typed relationships are stored as real
Neo4j relationships. `uid` includes the run ID; `id` retains the canonical record ID. A transaction writes
the full graph and switches `CustomerGraphDataset.currentRunId` only after all writes succeed. Retrying a sync
is idempotent. The same transaction attaches context to canonical Company records. Previous runs remain
linked as inactive history, including the earlier demo snapshots. The UI reads nodes and relationships back
from the existing Neo4j database.

The feature uses `connectNeo4j()` / `getDriver()` from the existing Neo4j integration and the application's
shared `NEO4J_*` settings exclusively. It neither owns nor closes a separate driver. All credentials stay
on the backend. The local environment points these settings to the already running repository Neo4j service.

If Neo4j is unavailable, the UI explicitly shows the last local/bundled snapshot as graph pending.
**Sync to Neo4j** attaches the saved run to the existing Company graph after that database is available.
A failed model request or configured
database commit preserves the active graph. A local `.local/customer-graph-run.json` file caches accepted runs.
External CRM, mailbox, support and billing connectors are not part of this mock-data demo.

The Docker backend uses the same shared `NEO4J_*` connection to the existing `neo4j` service. No new Compose
profile or customer graph service is required. The view can still show its explicitly labelled bundled replay
when that existing graph is unavailable.

## API and verification

- `GET /api/v1/customer-graph`: accounts, artifacts, catalog, accepted extraction, graph and truthful persistence status.
- `GET /api/v1/customer-graph/artifacts/:id/download`: original synthetic artifact.
- `POST /api/v1/customer-graph/ingest` with `{}`: run Terra and publish an accepted snapshot.
- `POST /api/v1/customer-graph/sync` with `{}`: publish the current saved extraction without a model request.

Demo mutations require `ENABLE_DEMO_CONTROLS=true` in production, matching the existing demo control policy.
The ingestion endpoint limits runs to three per five minutes and serializes concurrent requests per server.

Run `npm --prefix backend run test:customer-graph` for validation, transport, graph-path and HTTP checks.
Set `CUSTOMER_GRAPH_TEST_NEO4J=true` and the local preview/Neo4j variables to include the actual database
round-trip, shared-driver identity, canonical Company links, existing-property preservation and duplicate-sync
checks. Run `npm --prefix frontend run test:e2e -- customer-graph.spec.ts` for
desktop/mobile artifact browsing, downloads, evidence navigation and error preservation.
The explicitly opted-in `CUSTOMER_GRAPH_LIVE_SMOKE=true` browser test also makes a billed live Terra request
and verifies the new run survives reload from Neo4j.

Official API references: [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra),
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
