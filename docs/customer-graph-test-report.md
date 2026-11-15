# Customer graph test report

Completed 16 November 2026, approximately 00:41 Singapore time.

125 backend tests, 14 browser regressions and one live GPT-6.1 Terra ingestion scenario passed.
Both application builds passed. No unresolved test failures remain.

| Area | Passed | Evidence |
| --- | ---: | --- |
| Research, AI transport, business rules, events and deployment | 66 | `.local/test-audit/platform-tests.log` |
| Existing lead-ranking backend | 43 | `.local/test-audit/ranking-tests.log` |
| Customer ingestion and real Neo4j integration | 16 | `.local/test-audit/customer-graph-expanded-final.log` |
| Final browser regression run | 14 | `.local/test-audit/browser-regression-final.log`, `frontend/test-results/results.json` |
| Live Terra ingestion through the browser | 1 | `.local/test-audit/browser-full-first-results.json`; completed in 77.9 seconds |

The final browser run skips the explicitly opted-in live model case because that case had already passed
in the preceding full run. It verifies the subsequent graph-read hardening and layout fixes against the
persisted live extraction. The complete provider run remains recorded in the preceding report; no test
response was substituted for that live call.

## Coverage

- All 18 original artifacts across both accounts render their exact content. All 18 download endpoints
  return the original content; the browser email-download flow also verifies its filename.
- Facts retain literal source quotes, valid account/entity associations, valid dates and input/model versions.
- Ideas connect distinct facts from multiple source families within the same account.
- Malformed JSON, refusal responses, missing output, invented quotes, wrong models and cross-account
  references are rejected.
- Missing keys, production mutation controls, rate limits and concurrent ingestion preserve read access.
- Missing shared graph configuration and an unreachable database produce an explicitly labelled replay.
  Private connection overrides and implicit local database fallback are not used.
- Customer context uses the existing shared Neo4j driver and canonical Company records. Existing company
  names survive sync. Six simultaneous syncs preserve node/edge identity and one active context per company.
- A failure injected after graph writes and immediately before activation rolls back the entire transaction,
  leaving the prior active run intact and no abandoned test nodes or run records.
- Changed graph payloads and misdirected real relationships are rejected even when record counts match.
  The accepted local run remains available, and sync repairs corrupted projections.
- Ingestion runs cannot be rewritten under the same run ID.
- Browser coverage includes evidence navigation, source highlighting, search, empty results, retry after
  initial load failure, missing-key/uninitialized views, graph zoom, account switching and keyboard activation.
- Responsive checks cover 320, 390, 768, 1024 and 1440px widths, including main-area overflow, header bounds
  and single-line counters. Representative screenshots were inspected.
- Existing lead-ranking browser scenarios also pass, including replay, source failures, customer exclusion,
  cached-data handling, key entry, tooltips, shared navigation and mobile behavior.

## Fixes made during testing

1. **Run immutability:** an existing run ID previously accepted changed content. Dataset locking and an
   immutable-payload check now reject the rewrite with a conflict response before any graph changes commit.
2. **Graph integrity:** record counts alone did not detect changed content. Reads now verify the complete
   accepted node/edge projection, actual node properties, relationship types, endpoints and identifiers.
3. **Narrow layouts:** the long navigation title could extend outside the header at 320px, and the source
   counter could wrap. The title now truncates within its header; counters stay on one line.

The browser failure simulation was adjusted to hold the initial outage across React's development double
mount. The browser harness now starts the compiled backend, avoiding source-watcher restarts during tests.

## Final shared-database audit

Recorded at `2026-11-15T16:40:42.920Z` in `.local/test-audit/final-shared-graph.json`:

- Databases: `neo4j` and Neo4j's `system` database only.
- Both mock customers are linked to canonical Company records in the existing `neo4j` database.
- Each company has exactly one active context and four preserved historical snapshots.
- The current live Terra extraction contains 40 facts and 6 ideas from 18 artifacts: 81 context nodes and
  216 relationships within the context projection, plus its links into the existing Company graph.
- No rollback-test run records or projection nodes remain.

## Build and scope notes

Backend TypeScript and the frontend production build succeed. Vite reports a large JavaScript bundle
warning, approximately 786 kB before compression; this is a performance-tuning item.

These checks exercise mocked customer sources, the real OpenAI API and the existing local Neo4j instance.
External Salesforce, email, support, contract and billing connectors are not implemented in this mock demo.
Attribution checks do not replace human review of a model's interpretation or proposed commercial ideas.

## Reproduce

From `backend`, with the shared Neo4j settings configured:

```powershell
npm run build
node --test tests/research.test.cjs tests/freellmapi.test.cjs tests/business.test.cjs tests/events.test.cjs tests/deployment.test.cjs
npm run test:ranking
$env:CUSTOMER_GRAPH_TEST_NEO4J = 'true'
npm run test:customer-graph
```

From `frontend`:

```powershell
npm run build
npm run test:e2e
```

To include another billed live provider check:

```powershell
$env:CUSTOMER_GRAPH_LIVE_SMOKE = 'true'
npm run test:e2e
```
