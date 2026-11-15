# Cloud storage

MongoDB Atlas is the source of truth. Neo4j Aura is an idempotent projection of saved research; both are managed cloud services. No local database process or Docker is required.

## Configuration

Set these private environment variables on the Render backend, never on Vercel or in Git:

```
STORAGE_MODE=cloud
LOCAL_DEMO_MODE=false
HOSTED_PREVIEW=false
MONGODB_URI=<Atlas mongodb+srv URI with URL-encoded database credentials>
MONGODB_DB_NAME=enterprise_radar
NEO4J_URI=<Aura neo4j+s URI>
NEO4J_USERNAME=<database username>
NEO4J_PASSWORD=<database password>
NEO4J_DATABASE=neo4j
```

Keep the existing AI, CORS, port and provider settings. The Atlas user needs readWrite on this database. Allow the backend's actual Render outbound ranges in Atlas; refresh that list if the service changes region. Database passwords are separate from dashboard login passwords.

## Stored records

- `company_profiles`: canonical directory identity and the latest research reference, keyed by entity ID. Unknown industry, country and account relationship are not guessed.
- `research_snapshots`: immutable company/source/event snapshots, source hashes and publication/retrieval dates, plus the graph-sync outbox.
- `analysis_runs`: every generated report linked to its input snapshot and seller knowledge version. Earlier reports remain available after generating another report.
- `business_profiles` and `business_knowledge_versions`: active seller configuration and version history.
- Existing company, signal and opportunity collections remain available for account workflows. Public research does not silently manufacture an account or confirmed opportunity.

Company identity and its research snapshot/outbox entry are committed in a single Atlas transaction. A failed save is an error, never a successful temporary fallback.

## Graph

`Company -HAS_RESEARCH-> ResearchSnapshot -CITES-> EvidenceSource`

`ResearchSnapshot -REPORTS_EVENT-> BusinessEvent -SUPPORTED_BY-> EvidenceSource`

Source and event nodes are snapshot-scoped, so a later source revision cannot overwrite earlier evidence. Headline-only verification labels are retained. Commentary is saved as source context but does not become a company event. Graph edges represent research provenance, not confirmed buying intent.

The backend processes pending outbox entries every five seconds, uses a two-minute lease, projects each snapshot in one Neo4j transaction and retries failures with bounded backoff. Restarting the backend resumes pending or expired leased work. MERGE plus uniqueness constraints prevents duplicate nodes when a job retries. Atlas records remain available during a graph-sync failure.

## API and user flow

- `GET /api/v1/ai/research`: recent research history (maximum 100 snapshots).
- `GET /api/v1/ai/research/:id`: exact saved snapshot.
- `POST /api/v1/ai/analyze`: generate and save a new analysis run.
- `GET /api/v1/ai/analyses/latest?companyId=...`: latest saved report, or null.
- `GET /api/v1/ai/analyses/:id`: a specific report.
- `GET /api/v1/graph?researchId=...`: the selected snapshot's graph; omitted ID selects the latest synced snapshot.

Company Intelligence reopens saved research and its last report without making another AI request. The Knowledge Graph uses the real graph API and supports node inspection and source links.

The current application is a public prototype without authentication. Store public company research only. Do not add private customer/account information until roles and access controls are implemented.

## Verification

`npm run verify:cloud` validates both encrypted cloud connections, additive indexes, Neo4j constraints and seller configuration initialization. `npm run test:storage` checks saved-report isolation, graph evidence scope and retry/lease behavior. Complete a real research, reload its saved report, then restart the backend and verify the same snapshot/report IDs still load. Check `/api/v1/health/ready` and inspect a synced graph before switching the production frontend to this release.
