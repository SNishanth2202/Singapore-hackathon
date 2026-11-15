# Singtel customer exclusion audit

Checked on **15 November 2026** against the actual running queue: **15 opportunities across eight
accounts**. Public searches covered the account names and parent/alias names against Singtel
announcements, company material and the existing cited GeBIZ records. A live GeBIZ API request
reconfirmed the Singapore Customs award. This is not access to Singtel's private customer master.

## Findings and queue changes

| Account / parent checked | Finding | Decision |
| --- | --- | --- |
| Micron Singapore / Micron Technology | Singtel's 30 May 2022 announcement documents its Singapore 5G deployment for Micron; Singtel's 2023 investor Q&A also names a Micron contract. | Exclude O02 and O09, across products and buying units. |
| Singapore Customs / Ministry of Finance | Live GeBIZ record FINCEDETT23000009, row 1928: award 12 March 2024 to Singapore Telecommunications Limited for telecom services. | Exclude O06 and O16 conservatively as a known relationship. No current expiry or extension is inferred. |
| ETLA Limited / Frencken Group | No affirmative Singtel customer relationship found in the targeted public check. Shared stock-market coverage is not a customer relationship; a Singtel product case study is not proof that ETLA buys it. | Retain as not found in the mock customer register; real status unverified. |
| UMC Singapore / United Microelectronics Corporation | No affirmative relationship found in the targeted public check. Singtel's similarly named United Maintenance Company is a different entity. | Retain as not found in the mock register; real status unverified. |
| AEIM Pte Ltd / Polymatech Electronics | No affirmative relationship found in the targeted public check. The facility announcement establishes the facility, not its telecom supplier. | Retain as not found in the mock register; real status unverified. |
| Prefab Technology / Hor Kew | No affirmative relationship found in the targeted public check. | Retain as not found in the mock register; real status unverified. |
| Bombardier Singapore / Bombardier | No affirmative relationship found in the targeted public check. Co-mention as victims of a third-party breach does not establish a supplier/customer relationship. | Retain as not found in the mock register; real status unverified. |
| MCCY Headquarters / Ministry of Culture, Community and Youth | The pinned GeBIZ award CCY000ETT24000003 names NXGEN Communications. This is not proof that MCCY has no separate Singtel service. | Retain as not found in the mock register; real status unverified. |

The current eligible universe is **11 leads across six accounts**, or **12 leads** after replay creates
ETLA's new-site opportunity. No replacement companies were invented to preserve the old count.
The source and CRM records remain available for audit; excluded companies are omitted from rankings,
AI inputs, individual ranking decisions and comparison/ablation candidates.

Primary evidence:

- [Singtel: Micron deployment, 30 May 2022](https://www.singtel.com/about-us/media-centre/news-releases/singtel-partners-micron-to-deploy-commercial-5g-millimetre-wave-).
- [Singtel 2023 investor Q&A](https://cdn1.singteldigital.com/content/dam/singtel/investorRelations/annualReports/2023/ResponsesToQuestions.pdf).
- [Live Singapore Customs GeBIZ award query](https://data.gov.sg/api/action/datastore_search?resource_id=d_acde1106003906a75c3fa052592f2fcb&q=FINCEDETT23000009&limit=5).
- [MOF procurement dataset](https://data.gov.sg/datasets/d_acde1106003906a75c3fa052592f2fcb/view), also supplying the pinned MCCY, MOF Headquarters and Workforce Singapore award observations.

## Backend contract for further generations

`backend/src/fixtures/lead-ranking/singtel-customers.json` is the mock exclusion database. Its initial
six records cover Micron, Singapore Customs, MOF Headquarters, Workforce Singapore, Hyundai Motor Group
and NUHS. The additional entities are supported by pinned awards or Singtel's 2023 investor Q&A and
prevent them from entering future queues. Public
historical relationships are conservatively excluded; the file does not claim their contracts are active.

- Every ranking read/publication checks canonical account IDs, exact normalized legal names and aliases.
  Explicit `groupNames` also exclude matched subsidiaries; shared government umbrellas do not imply
  a group-wide customer relationship. No substring or model-only customer matching is used.
- All product/site/window opportunities belonging to a matched account are excluded before scenario
  evaluation and before OpenAI receives candidates. Public-trigger creation, reset, all three views,
  comparisons and persisted-state reloads use the same policy.
- Each allowed row carries `customerCheck.result = not_found_in_mock_customer_database` and the database
  version. Each queue carries `customerEligibility`, including the excluded IDs, match basis and evidence
  URLs. `GET /api/v1/ranking/customers` exposes only this mock register.
- Edit the trusted local JSON register to add customer IDs, aliases or explicit groups. It is read on
  every request: content changes invalidate queue/model caches without requiring reset or restart.
  `SINGTEL_CUSTOMER_DB_PATH` optionally selects another trusted local JSON file with the same schema.
  Production customer-master integration would replace this adapter.
- Cached and stale AI results are intersected with current eligible candidates, including a customer
  update while a model call is in flight. A model cannot put an excluded ID back into the queue.
- Generated opportunity suggestions from `/sources/extract` use the same register before returning
  proposals. Cached extractions and new model responses are checked against the latest file; public
  source facts remain available even when their suggested opportunity is excluded.
- Discovery's `import-discovery` hand-off checks both the researched company and its candidate identities
  before ingestion or downstream sales-workflow creation. A customer match returns HTTP 409 /
  `SINGTEL_CUSTOMER_EXCLUDED`; the UI displays the reason and creates no new ranked lead.
- An invalid/missing customer database fails closed with HTTP 503 / `CUSTOMER_DATABASE_UNAVAILABLE`.
  The browser discards its cached ranking for that error instead of showing unchecked old leads.
  If every candidate is excluded, the result is a healthy empty list without a model call.

Retained managed-WAN renewal prospects represent competitive renewals from a synthetic incumbent.
They are not a claim of a current Singtel contract. Replay service-case examples now use an eligible
UMC pre-sales serviceability case rather than excluded Micron.

Regression coverage includes names/aliases/groups, false substring matches, all views, future public
discovery, live file edits, persistence, stale model results, in-flight changes, empty output and database
failure. **An absence from public search or this mock register cannot certify real non-customer status.**
That final assurance requires Singtel's actual customer master and reviewed legal-entity mappings.

Verification on 15 November 2026: 43 ranking/importer/API/model/customer/discovery tests, 66 existing app tests,
6 connector tests and 6 browser tests passed (five core browser flows plus the targeted customer-database
failure check). Backend and frontend builds passed, as did the offline replay verifier. The packaged
backend test confirms that the customer register ships with the build and excludes four leads without
depending on workspace docs. A separate live OpenAI/browser check returned 11 leads across the six
retained accounts, customer-check metadata on every row and no page errors.
