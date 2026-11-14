# Editable seller knowledge

Open **Settings → Business knowledge** in the dashboard. The backend now uses structured seller data for every company analysis. This is configuration and evidence matching, not model fine-tuning.

## What is included

The initial catalogue contains 14 service areas: business connectivity, international connectivity, SD-WAN, cybersecurity, cloud, managed services, enterprise 5G, IoT, business mobility, communication and collaboration, data centres, AI infrastructure/security, quantum-safe networking and satellite services.

Each area has a stable ID, active flag, capabilities, customer problems, buyer roles, target segment IDs, literal signal phrases, discovery questions, source references and availability checks. The seller has canonical names, aliases, directory entity IDs and domains. Strategy contains customer segments, priority research markets, hunting/farming workflows, objectives and outcome measures. Evidence policy controls recency and excluded inference terms.

Seller capability references were checked against Singtel's official business pages on 13 November 2026. Each source record contains its own URL and check date. This is a capability-level starting catalogue; it is not an exhaustive list of every product SKU, a price list or a coverage commitment. Review references periodically.

**Target segments, industry examples, buyer roles, signal phrases and research priorities are team-configured hypotheses.** They are not claims about Singtel's official internal sales strategy. Singapore–India/APAC is the team's research focus, not proof of service availability in each country.

## Analysis flow

1. Read one validated knowledge snapshot at the start of the request.
2. Check whether the selected company matches the configured seller by entity ID, domain or exact canonical name. If so, return HOLD and ask for an external company; do not call the model.
3. Collect eligible evidence: dated, recent, non-profile material. Retrieval/detection dates do not replace publication/event dates. Controlled fictional samples use their labelled scenario dates.
4. Classify sources into company actions, commentary, background or ambiguous material. Group closely matching reports of the same action into one event while preserving their source links. A publisher byline or macroeconomic article does not establish the company's own investment. Event classification and grouping are conservative heuristics and may miss synonyms or unusual wording.
5. Build candidate service matches from active offering rules. `signalRules` produce `DIRECT_SIGNAL` connections using phrases and optional allowed event types. `discoveryRules` connect explicit event types and topics to `EXPLORATORY` questions. Each rule can require additional terms and exclude terms. An AI acquisition can justify asking about integration without claiming an infrastructure purchase. Neither fit level establishes demand.
6. Send seller identity, objectives, segments, catalogue, grouped events and candidate-specific discovery guidance to the AI. Excluded commentary is identified separately. Seller references cannot establish customer demand. Public-research factual summaries and reported-event observations are assembled from the approved event inventory; AI interpretation stays in the hypothesis fields.
7. Validate generated evidence IDs and active offering IDs. Resolve displayed service names from the catalogue. Reject unknown or inactive offerings. Withhold suggestions without service-related citations, with an explicit reason code. Remove an irrelevant extra citation without discarding a hypothesis that still has valid support.
8. Return `businessContext` and `evidenceAssessment` with source/event counts, repeated coverage, commentary exclusions, source limitations and specific rejection reasons. Preserve the knowledge version used. These are discovery candidates, not qualified leads or purchase scores.

Readiness is determined after evidence checks: `DISCOVERY_READY` means there is a supported conditional hypothesis for a targeted conversation; `NEEDS_RESEARCH` means company events exist but no generated service hypothesis passed validation; `HOLD` means there is no eligible current company event (or the selected company is the seller). Unknown budgets or incumbent gaps alone do not prevent exploratory discovery. The UI separates missing source verification from questions to confirm with the customer and does not display a blanket 'more evidence needed' message.

Existing account signals can store optional `publishedAt`. Legacy signals with only `detectedAt` do not establish a current buying trigger. The account relationship remains unknown until actual account history is connected; public news cannot establish farming/cross-sell eligibility.

## Change the knowledge

Use **Settings → Business knowledge → Edit structured business knowledge**. Change the JSON lists, then save. The server validates the entire configuration, increments the version and saves it for subsequent analyses. Keep version/updatedAt as loaded; the server manages the next values. Reloading discards unsaved edits. A stale save receives a conflict instead of overwriting someone else's saved version.

For a new service, copy an offering object and give it a unique stable `id` and `name`. Update capabilities, customer problems, buyer roles, questions and signal rules. For exploratory links, configure `discoveryRules` with `eventTypes`, `anyTerms`, `requiredAnyTerms`, `excludeTerms` and a conditional `rationale`. Reference existing segment IDs and a valid official source ID; add a source record when needed. Keep `availability.verificationRequired: true`. Set `active: false` to retire a service. Existing services require no additional `if/else` code when the catalogue changes.

The JSON API is:

```http
GET /api/v1/ai/business-knowledge
PUT /api/v1/ai/business-knowledge
Content-Type: application/json
```

PUT body: `{ "expectedVersion": <version loaded from GET>, "knowledge": <complete object returned by GET, with your edits> }`. The object uses schema version 1. Unknown fields, invalid IDs/dates/URLs, duplicate IDs/names and broken source/segment references are rejected. Unknown keys such as credential fields are rejected; do not place secrets in free-text fields either, since business data is sent to the configured model.

No authentication has been added. These endpoints use the same existing local-development/allowed-origin boundary as the AI research routes. An authenticated admin role can be added later without changing the business schema or matching logic.

## Files and persistence

- `src/business/singtel.seed.json`: tracked initial structured catalogue.
- `src/business/schema.ts`: validation and reference checks.
- `src/business/store.ts`: file persistence and version updates.
- `src/business/matching.ts`: identity and configurable candidate rules.
- `src/business/prompt.ts`: seller context assembled for the model.
- `data/business/current.json`: active saved override, created on first save, ignored by Git.
- `data/business/versions/`: snapshots archived during saves, ignored by Git. `current.json` is the authoritative active version.

On first use, the backend reads the seed when there is no saved override. After saving, edits in Settings take precedence over the seed. Export the GET response to share a saved configuration with teammates. Saved edits survive backend restarts. Invalid saved data fails visibly; the backend does not silently switch to other business rules. File storage is intended for this single-backend local prototype; multiple backend instances need a shared store and transactional concurrency control.

Every newly returned analysis identifies the knowledge version used. Analysis results and session reviews are still not persisted; old results are not automatically regenerated when configuration changes. Save a new version, then choose **Analyze again**.

For an older saved configuration without discovery rules, build the backend and run `node dist/scripts/upgrade-discovery-rules.js` once. It adds the initial event-based rules through a versioned save while preserving existing seller, strategy, references and offering fields. It leaves configurations with existing discovery rules alone. Newly created installations already include these rules in the seed. Old research snapshots are reclassified and grouped when analyzed; a new web search is not required to use the improved logic.

## Verification

From `backend`, run `npm run test:research` for the combined business, research and AI checks, or `npm run test:business` for business configuration checks. Build the frontend with `npm run build` in `frontend`.

Live checks: search Singtel and verify the seller HOLD response; analyze the fictional logistics profile for a conditional connectivity discovery question; edit and save knowledge in Settings, reload it, then analyze again and inspect the returned knowledge version.
