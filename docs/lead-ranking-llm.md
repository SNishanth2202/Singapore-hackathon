# Active OpenAI lead assessment

This is the current runtime contract, superseding the original deterministic plan for the default
ranking mode. The opportunity tuple, cited source importer, synthetic CRM fixtures and hard gates remain.
OpenAI now chooses the internal ordering score, urgency and confidence from the supplied evidence.

## Architecture and data

1. `RankingService` joins the cited public snapshots/GeBIZ connector with synthetic Salesforce-style
   accounts, contacts, opportunities, contracts, activities and cases. It applies versioned events and
   enforces site serviceability, technical requirements and deadlines.
2. `modelInput` in `backend/src/ranking/openai-ranking.ts` sends every candidate's raw facts, evidence
   IDs, source dates, excerpts, estimates and required action to the OpenAI Responses API. Baseline points,
   scores, priority labels and scenario confidence are excluded. Source excerpts are untrusted data.
3. OpenAI returns exactly one structured assessment per candidate: internal `score` (0–100),
   `priorityStatus` (five urgency labels), nullable `confidence` (0–100), full reasons, 1–4 urgency
   descriptors and 1–4 confidence descriptors of 2–5 words each, cited `evidenceIds` and `verifyNext`.
   Runtime validation rejects missing/duplicate/invented lead IDs, invalid values, unsupported evidence
   references and numeric confidence for explicitly unbounded decisive facts.
4. `LlmQueueService` preserves the application-selected gate actions, then sorts actionable leads before
   Monitor and Blocked. Within each tier: descending model score, ascending required deadline, canonical ID.
   The top five actionable leads form this week's working band. Model urgency is a separate judgment,
   without the old fixed score thresholds.
5. React displays rank, urgency, **confidence as a percentage**, action, owner/deadline and evidence.
   The ordering score stays internal. Hover, focus or tap urgency/confidence to open its short reasons.
   The detail panel retains full model rationale, model name, assessment time, cited IDs and gate proof.

Confidence is the model's subjective assessment of the evidence supporting its urgency judgment.
It is not calibrated win probability or a frequency of scenario outcomes. Null displays **Insufficient
evidence**. The ten-scenario calculation remains available only in the deterministic reference engine.
Source quality and recency descriptors must describe supplied facts, not assume that retrieval makes
an old announcement recent. A cited source does not establish buying intent or current fulfilment.

## Keys on this machine and another machine

The backend reads optional `OPENAI_API_KEY` from ignored project-root `.env` and defaults
`OPENAI_MODEL` to `gpt-4.1-mini`. Never put a key in a `VITE_` variable or commit `.env`.
If no key is configured, the UI automatically opens **Connect OpenAI**. Its password field submits to
`POST /api/v1/ranking/llm/session`. The backend checks model access and keeps the key only in memory.
The browser receives an opaque HttpOnly cookie, not the key. Keys are never returned in API responses,
queue exports, error messages, localStorage or sessionStorage. Sessions expire after eight hours and
are lost on server restart; `DELETE /llm/session` clears a browser-provided key. A session key overrides
the environment key only for that browser. OpenAI charges apply to the supplied project's API account.
Use HTTPS and the existing trusted-proxy/origin configuration when hosting; split sites also depend
on the browser's cookie policy. This local prototype does not provide production user authentication.

## Refresh, failures and comparisons

Identical evidence/model/prompt fingerprints reuse the successful assessment; concurrent requests share
one call. Duplicate events are no-ops. Relevant events and deadline threshold changes invalidate the
assessment. **Reassess leads** explicitly requests a fresh assessment, which can vary because it is live AI.
Responses use strict structured output with `store: false`; source discovery itself is not an autonomous
LLM web search. Public discovery still comes from the reviewed importer and replayed trigger.

Environment-key assessments are cached under ignored `.local/llm-ranking-cache.json`; browser-session
assessments stay in backend memory. Neither cache contains an API key. A provider error retains the last
successful result with its assessment time and a stale warning. Before any successful assessment the
complete rules preview remains visible with **Awaiting AI**, without fabricated AI confidence. An empty
initialized queue returns `[]` without a model call. Public connector failure retains the last source
generation and exposes its refresh error separately from model status.

CRM-only and enriched views assess the same seeded candidates independently. Deal-value ordering uses
the enriched candidates without an additional model call. Comparisons display ranks and contributed
public evidence IDs. Source-family ablations are explicitly labelled deterministic reference checks;
they do not measure the model's confidence or real sales uplift.

## Acceptance and verification

- `npm --prefix backend run test:ranking`: input isolation, strict output validation, immutable gates,
  model-selected labels/confidence, sorting, caching/singleflight, event invalidation, stale preservation,
  empty results, assessment races, key isolation and HttpOnly setup through the HTTP API.
- `npm --prefix frontend run test:e2e`: separate ports 3010/5010 and a separate rules fixture store;
  no paid calls or changes to the running local demo. The browser API mock exercises automatic key setup,
  no key in browser storage, no score column, percentage confidence, hover/focus/Escape and mobile tap.
- `npm --prefix backend run verify:ranking-demo` remains the reproducible **rules-baseline** replay test;
  its exact historical scores/scenario counts are not expected from the live model.
- Build both packages and run existing app/connector tests. Inspect the actual live-model UI separately;
  mocked-provider tests establish application behavior, not the semantic quality of every model judgment.

Live verification on 15 November 2026 completed a real whole-queue Responses call for 15 candidates with
served model `gpt-4.1-mini-2025-04-14`. Urgency, confidence and short cited reasons came from that call.
No real Salesforce or Singtel engineering system was connected.

API references: [Responses create](https://developers.openai.com/api/reference/resources/responses/methods/create),
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
