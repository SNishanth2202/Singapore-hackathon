# Active AI lead assessment

This is the current runtime contract, superseding the original deterministic plan for the default
ranking mode. The opportunity tuple, cited source importer, synthetic CRM fixtures and hard gates remain.
The configured AI provider chooses the internal ordering score, urgency and confidence from the supplied evidence.

**Customer eligibility update:** the backend excludes known Singtel customer matches before ranking
and before sending candidates to the AI provider. The current public audit removes Micron and Singapore Customs,
leaving 11 initial eligible leads (12 after ETLA discovery). See the
[customer audit and policy](lead-ranking-customer-audit.md) for all eight reviewed accounts, evidence,
database format, alias/group matching, cache invalidation and fail-closed behavior. Remaining rows mean
not found in the mock register; actual non-customer status requires Singtel's customer master.

## Architecture and data

1. `RankingService` joins the cited public snapshots/GeBIZ connector with synthetic Salesforce-style
   accounts, contacts, opportunities, contracts, activities and cases. It applies versioned events and
   checks the mock Singtel customer exclusion register, then enforces site serviceability, technical
   requirements and deadlines. Retained WAN renewals are competitive renewals from synthetic incumbents.
2. `modelInput` in `backend/src/ranking/openai-ranking.ts` sends every candidate's raw facts, evidence
   IDs, source dates, excerpts, estimates and required action to the configured AI API. Baseline points,
   scores, priority labels and scenario confidence are excluded. Source excerpts are untrusted data.
3. The model returns exactly one structured assessment per candidate: internal `score` (0–100),
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

Lead Ranking first reuses the same explicit `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_PROTOCOL`,
`AI_TIMEOUT_MS` and `AI_REASONING_EFFORT` settings as company research. For OpenRouter, use
`https://openrouter.ai/api/v1` and `chat_completions`. Hosted variables belong on the backend;
local development reads ignored project-root `.env`. Never put a key in a `VITE_` variable or commit `.env`.
A partial or invalid `AI_*` provider configuration fails closed; it never borrows another provider's key.
When no generic provider is selected, optional `OPENAI_API_KEY` / `OPENAI_MODEL` remain a fallback
(default model `gpt-4.1-mini`). The configured connection drawer shows the provider and model without
asking for another key. **Use a separate OpenAI key** is an optional browser override.
If no key is configured, the UI automatically opens **Connect AI**. Its OpenAI password field submits to
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
The shared provider uses its configured Chat Completions or Responses protocol. For OpenRouter Chat
Completions, the backend checks the configured model's advertised capabilities. When `tools` and
`tool_choice` are supported, it requests one forced `submit_lead_assessments` formatting call and reads
its JSON arguments as data; it executes no tool. Missing, duplicate or unexpected calls are rejected.
Other compatible completions receive the required JSON schema in the prompt. The backend still enforces
the exact same lead inventory, evidence ownership, descriptor lengths and confidence constraints before
publishing anything. An invalid JSON/schema/evidence result gets at most one model correction within
the original request time budget; the full output must pass all checks. Provider failures are not retried.
Truncated Chat Completions are rejected. The legacy direct OpenAI path uses strict
structured output with `store: false`; shared Responses also uses `store: false`. Source discovery itself
is not an autonomous LLM web search. Public discovery still comes from the reviewed importer and replayed trigger.

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

- `npm --prefix backend run test:ranking`: shared-provider routing, advertised tool output, bounded correction,
  input isolation, strict output validation, immutable gates,
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

Shared-provider verification on 15 November 2026 used the existing backend OpenRouter configuration
with `nvidia/nemotron-3.5-lightning:free`. A real whole-queue formatting-tool response passed validation
for all 11 eligible leads. The local browser showed 11 assessed rows and the existing OpenRouter
connection without requesting another key. Both builds and 117 backend regression tests passed.

API references: [Responses create](https://developers.openai.com/api/reference/resources/responses/methods/create),
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
OpenRouter references: [Tool calling](https://openrouter.ai/blog/tutorials/tool-calling/),
[Structured output options](https://openrouter.ai/blog/tutorials/structured-output-llm/).
