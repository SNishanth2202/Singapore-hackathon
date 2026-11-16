# Customer portfolio connector

The dashboard and `/crm` now use a separate read-only CRM data source. The existing application database, company research, sales workflows, document CRM and evidence graph remain available. Original document accounts are accessible at `/crm/records`; their old direct account URLs still work.

## Server configuration

Configure these privately, never in Vercel frontend variables or source control:

- `CRM_SOURCE_MONGODB_URI`: the source Atlas connection string. It does not replace `MONGODB_URI`.
- `CRM_SOURCE_DB_NAME`: optional override; otherwise the database in the connection string is used.
- `CRM_PORTFOLIO_CACHE_PATH`: optional private file for a calculated account view.
- `CRM_SOURCE_USE_SAVED_VIEW`: default `false`. With `true`, read only the explicitly configured saved view. Its original reporting month, sync date and source metadata are retained; it is never described as a fresh source read.

Local optional settings load from the ignored `.local/crm-source.env`, without overriding process environment variables. The current local setup uses a private calculated view read from the supplied source database because this computer's direct Atlas TLS connection times out. The temporary cloud reader was stopped after downloading the calculated view; no full raw CRM dump is retained locally. The saved view is ignored by Git. The source dataset itself marks operational data synthetic; its provenance is retained in the API, source details and exports.

On a cloud backend with access to Atlas, configure the source URI and leave saved-view mode false. The connector reads the eleven supported collections, validates references and computes the view. Requests share a fifteen-minute in-process cache and a single in-flight read. Source failures return a retryable error and never substitute unrelated fixtures. No source collection is written to. No application or cloud deployment is performed by configuring these local files.

`npm --prefix backend run refresh:crm` generates a private saved view from the source when the executing environment can connect. `CRM_PORTFOLIO_CACHE_PATH` controls its destination; default is `.local/crm-portfolio.json` at the repository root. Production deployments should obtain their secret URI from Render environment settings, not from the local file.

## Product flow

- Dashboard: customer totals, monthly billed amount, capacity candidates, plan optimisation, billing trend, service/contract review counts and next customer conversations.
- CRM: account search, focus filters, sorting, pagination, current-view export and an account worklist.
- Customer 360: recommended actions, subscription usage and contract status, recorded opportunity pipeline, invoices, recent conversations, connected accounts, source IDs and account-brief export.
- Discovery and outreach analytics remain accessible in an expandable dashboard section. They are separate from CRM billing and pipeline figures; CRM invoices are not added to email conversion metrics.

## Rules and evidence

- Latest reporting month is derived from source periods, not set to the current month.
- Sum usage across site rows for each subscription/month before dividing by its allowance. Zero allowance gives no utilisation estimate.
- Capacity candidates exceed 100%; optimisation candidates are below 30%. These are review suggestions, not confirmed upsell or savings amounts.
- Current billing is the sum of invoices in the latest reporting month, including tax. It is not recognised revenue or cash collected.
- Open annual pipeline and probability-weighted value come only from Open opportunity records. Past close dates remain visible as review tasks.
- Availability below the recorded target and the stored SLA flag remain separate. Neither is silently rewritten.
- Past-end contracts marked active become contract-review tasks; original status and dates survive in the account projection.
- Negative latest interactions and flagged service incidents take precedence over capacity conversations. Source data, not illustrative stored priority scores, drives the worklist.
- Missing contact records are not invented. This connector does not activate or send email.
- Accounts join on stable source IDs, not names. Source accounts are not automatically merged with the older document-CRM identities.

## API

- `GET /api/v1/crm/portfolio`: reporting metadata, metrics, trends, source quality and account summaries; no full account-detail payloads.
- `GET /api/v1/crm/portfolio/accounts/:id`: one account's records and related-account references.
- `?refresh=true`: re-read the configured source/view. Browser account and portfolio refresh requests use the same store.

Connection strings and driver errors are never returned. Responses use `Cache-Control: no-store`.

## Verification

Backend tests cover financial arithmetic, multi-site usage roll-ups, duplicate/orphan IDs, cross-account references, zero allowance, provenance, service/contract conflicts, single-flight caching, explicit saved views, safe errors and account-scoped API access. Browser checks cover dashboard totals, filters/search/pagination, all account sections, relationship navigation, export, refresh, error/retry behaviour, mobile layout and retained document CRM navigation. Source-derived integration checks skip when no private source/view is configured; unit tests use a small independent fixture.

No commit, push, merge, deployment or source-database mutation is part of this change.
