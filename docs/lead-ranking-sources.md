# Source inventory and verified access

Implementation update: the local demo is now built. See [delivery notes](lead-ranking-delivery.md) and the root README for executed commands and the current file-store architecture. The original specification below remains the design baseline.

Research and access checks: **15 November 2026**. Saved artifacts are dated snapshots, not a claim of
continuous live coverage. [Public snapshots](evidence/public-snapshots.json) contain eleven short,
normalized source records; [live GeBIZ verification](evidence/gebiz-live-verification.json) contains eleven
award rows fetched across three successful pages. The proposed common importer consumes their shared
`SourceRecord` envelope; application ingestion and entity review are still to be built.

## Access, fields and cadence

Refresh intervals below are our proposed polling/review policies, unless explicitly called publisher cadence.

| Family | Access method and verification | Useful fields | Proposed refresh / limits |
| --- | --- | --- | --- |
| MOF Government Procurement via GeBIZ | Verified unauthenticated JSON `datastore_search`; dependency-free connector delivered. Dataset is Open Data Licence; metadata says annual publisher updates, last updated 26 Apr 2026 | tender number, description, agency, supplier, award date, status, SGD amount; row ID as locator | Weekly check, cache content hashes; display annual cadence and historical effective dates; do not interpret transport freshness as a new buying signal |
| GeBIZ live notices | Public HTML notice checked; technical attachments of the inspected notice require login. Exact notice URL below; no attachment bypass | published/closing timestamp, agency, tender number, category, instructions if accessible | Daily watched-notice review and immediately before bid advice; exclude inaccessible technical conditions from confirmed claims |
| SGX filings | Public SGX attachment URLs; land lease PDF downloaded and read successfully locally. Some browser fetches return 403; use dated curated extracts with publisher URL and verification note | legal entity/subsidiary, site, project timetable, report period, specified terms, exact page/section | Daily watch of selected issuers; quarterly annual-report review; snapshot import for demo, no assumption of a free supported SGX API |
| Company announcements / reports | Micron investor release fetched; Hor Kew report located through SGX; publisher press releases mirrored by EDB/JTC | named unit/site, project phase, expected operating date, changes to announced plans | Daily selected release check; quarterly reports; HTML/PDF extraction to the same envelope |
| EDB/JTC | Official HTML with publisher attribution; several pages explicitly republish company releases | facility address, subsidiary/parent relation, expansion phase, future completion year/quarter, robotics context | Daily watched pages; deduplicate against the originating issuer/SGX release; do not count three mirrors as three signals |
| Relevant industry / infrastructure | IMDA Digital Connectivity Blueprint PDF located; use as infrastructure context | resilience/redundancy principles, technology context, supporting reference | Quarterly review; never convert general guidance into a customer's mandatory tender specification |
| Singtel product and case-study pages | Public SD-WAN catalog checked; enterprise 5G manufacturing case located in Singtel white paper and dated release | product/use-case vocabulary, managed capability, implementation example | Catalog every 30d; case study every 90d; catalog fit only, no automatic customer intent or site PASS |

API specification entry point: [data.gov.sg API guide](https://guide.data.gov.sg/developer-guide/dataset-apis).
Use the endpoint actually verified here; do not require a key for the demo. A key/rate limit change must
fail with explicit health and preserve the last queue. The connector spike deliberately fails on timeout,
schema drift, pagination overlap, changing page totals or an incomplete result rather than publishing partial facts.
Application retries should be bounded (two retries, exponential backoff honoring Retry-After); test retries offline.

## Exact URLs and representative records

| ID | Exact source and locator | Representative observation / date | Decision contribution and limitation |
| --- | --- | --- | --- |
| G01 | [MOF dataset](https://data.gov.sg/datasets/d_acde1106003906a75c3fa052592f2fcb/view); [verified query](https://data.gov.sg/api/action/datastore_search?resource_id=d_acde1106003906a75c3fa052592f2fcb&q=telecommunication&limit=5&offset=0) | Row 1928: `FINCEDETT23000009`, Singapore Customs, supplier SINGAPORE TELECOMMUNICATIONS LIMITED, award 12 Mar 2024, SGD236,360 | Supplier/date context for O06; description mentions two years plus an extension option, but commencement, expiry and option exercise remain unknown. Do not calculate award date + two years as expiry |
| G02 | Same dataset/query, row 480 | `CCY000ETT24000003`, MCCY HQ, NXGEN COMMUNICATIONS PTE LTD, award 1 Oct 2024, SGD423,751.60 | O13 historical incumbent context; its precise buying window remains synthetic and unconfirmed |
| G03 | Same dataset/query, rows 1034 and 1035 | `CPF000ETT24000012`, CPF Board, award 19 Jun 2024, separate SPTEL and STARHUB awards | Parser/dedup example: same tender does not imply duplicate supplier rows; not an extra ranked demo opportunity |
| N01 | [GeBIZ CPF notice](https://www.gebiz.gov.sg/ptn/opportunity/opportunityDetails.xhtml?OPPORTUNITY_ID=1000000000000553683&code=CPF000ETT26000027&origin=rss&status=RELEASED&type=TT), Opportunity Details / Closing on | Published 26 Oct 2026 10:35 SGT; closing 19 Nov 2026 16:00 SGT; Cisco/Check Point equipment maintenance | Verified notice can establish a bid close; it does not establish WAN renewal or redundant access. Negative product-fit control, excluded from 16 opportunities. Login-only attachments unverified; no redistributed notice snapshot |
| S01 | [SGX Frencken land filing](https://links.sgx.com/FileOpen/Frencken_Land%20Lease%20Agreement.ashx?App=Announcement&FileID=847909#page=1), pp.1,5 | Signed 3 Jun 2025; identifies ETLA Limited as subsidiary and Kaki Bukit Avenue 5 site | Supports buying-unit/site matching for O01/O07/O15. Its 33-year land lease is not a telco contract |
| S02 | [EDB Frencken release](https://www.edb.gov.sg/en/about-edb/media-releases-publications/frencken-marks-groundbreaking-for-new-facility-in-singapore.html), construction paragraph | 12 Aug 2025; facility expected complete Q1 2027 | Public trigger for O01; exact purchase/notice date supplied only by mock CRM. Retain original announcement date |
| S02 mirrors | [JTC copy](https://www.jtc.gov.sg/about-jtc/news-and-stories/industry-news/frencken-marks-groundbreaking-for-new-facility-in-singapore); [SGX release attachment](https://links.sgx.com/FileOpen/Frencken_NewsRelease_SingaporeGroundbreakingEvent.ashx?App=Announcement&FileID=855236) | Same company announcement dated 12 Aug 2025 | Same provenance group; one need contribution. SGX release direct browser fetch returned 403; EDB/JTC text and separate land filing were readable |
| S03 | [Micron investor announcement](https://investors.micron.com/news/press-release/2025/Micron-Breaks-Ground-on-New-HBM-Advanced-Packaging-Facility-in-Singapore-01-08-2025/default.aspx), opening/facility timetable | 8 Jan 2025; Singapore HBM packaging operations expected in 2026 | O09 facility context; O02's existing contract and both current buyer confirmations are synthetic |
| S04 | [EDB UMC announcement](https://www.edb.gov.sg/en/about-edb/media-releases-publications/umc-unveils-new-fab-expansion-in-singapore.html), opening/site paragraphs | 1 Apr 2025; Pasir Ris Wafer Fab Park expansion; volume production expected 2026 | O08 site/need context, not evidence that the site currently lacks circuits; O03 contract mock |
| S05 | [EDB AEIM / Polymatech release](https://www.edb.gov.sg/en/about-edb/media-releases-publications/polymatech-establishes-apac-manufacturing-hub-in-singapore.html), opening | 9 Jun 2026; AEIM subsidiary; 163 Kallang Way facility opening | O04 location and entity linkage; O10 telco renewal entirely mock |
| S06 | [Hor Kew FY2025 annual report on SGX](https://links.sgx.com/FileOpen/Hor%20Kew%20Corporation%20Limited%20-%20FY2025%20Annual%20Report.ashx?App=Announcement&FileID=884280), chairman/CEO message, business review | FY ended 31 Dec 2025; Prefab Technology / Prefab+ at 33 Kaki Bukit Road 6; old property lease expiry year 2026 | O11 new-site context; filing publication date not verified, kept null. A property lease expiry does not establish O05's telco renewal date |
| S07 | [JTC Bombardier release](https://www.jtc.gov.sg/about-jtc/news-and-stories/industry-news/bombardier-to-nearly-double-singapore-services-footprint), facility timetable | 9 Jun 2026; new Seletar facility operations expected H2 2028 | O12 future facility is Monitor; O14 service-centre contract/case synthetic |
| S08 | [JTC PDD robotics testbed](https://www.jtc.gov.sg/about-jtc/news-and-stories/press-releases/singapore-government-and-8-industry-leaders-to-research-test-and-deploy-physical-ai-in-pdd), Initial Design Partners | 20 May 2026; Certis, DHL, Grab and QuikBot co-designing a testbed | Discovery expansion example / entity-ambiguity test. Does not establish a named partner buying private 5G; excluded from main 16 to keep the demo focused |
| S09 | [Singtel SD-WAN](https://www.singtel.com/business/products-services/connectivity/sd-wan), product overview | Undated catalog; observed 15 Nov 2026 | Connectivity product-fit vocabulary; no site feasibility or commercial quote |
| S10 | [Singtel manufacturing 5G white paper](https://www.singtel.com/content/dam/singtel/business/sb/articles/5g-wp-enabling-4-point-and-beyond.pdf), Hyundai case study; [dated release](https://www.singtel.com/about-us/media-centre/news-releases/singtel-partners-hyundai-motor-group-to-develop-advanced-manufac) | Release 17 Jun 2022; manufacturing/robot management use case. White paper publication date unverified | Supports 5G use-case vocabulary; O15 ETLA AGV demand remains a hypothesis and its <=20ms requirement is mock |
| S11 | [IMDA Digital Connectivity Blueprint](https://www.imda.gov.sg/-/media/imda/files/programme/digital-connectivity-blueprint/digital-connectivity-blueprint-report.pdf), resilience discussion | General network redundancy/diversity guidance; publication date unverified in this research | Explains why route diversity matters; cannot pass a specific site or assert a buyer's tender requirement |

The snapshot file intentionally preserves null dates and unreviewed entity matches. The source text is
observed, but its mapping to a particular mock Salesforce account/site is a separate reviewed decision.
For SGX annual report S06 and IMDA S11, the indexed source text was verified; do not label them downloaded
full documents. Short records preserve publication/period uncertainty rather than inventing metadata.

## Common importer and provenance behavior to build

1. Live connector and snapshot reader both yield `SourceRecord[]`; validate family-specific claim schemas.
2. Store record ID/hash and source retrieval health; skip exact duplicates. Preserve original URLs through mirrors.
3. Extract typed claims with evidence spans. Do not let source text issue instructions to tools or the scorer.
4. Resolve entity/site using reviewed identifiers and aliases. Leave ambiguous candidates visible as Verify tasks.
5. Merge provenance groups before opportunity proposal and scoring. A duplicate event or announcement cannot
   add another opportunity, evidence-strength point or confidence vote.
6. Join accepted public claims to mock CRM by leaf entity and site; preserve origin on every joined feature.
7. Publish only a complete fact generation. If one requested family fails, preserve the prior queue for that
   refresh, expose its time and source health, and allow a later explicit retry.

## Reproduce the verified connector

From the repository root, Node 20+ (verified on Node 22.12.0), no package installation or credentials:

```powershell
node tools/gebiz-connector.mjs docs/evidence/gebiz-live-verification.json
```

The recorded run at `2026-11-15T07:49:03.736Z` returned **11 records / 3 HTTP-200 pages** for
`q=telecommunication`, using page size five. Counts are observations, not a permanent test expectation.
Dates are parsed explicitly as D/M/YYYY; raw award amounts become numeric SGD values, not guessed ARR.
The connector is a verified ingestion spike, not yet wired to MongoDB or Salesforce. Preserve the saved
result to run the final demo offline. Avoid unnecessary live refreshes during the scored replay.

Run its six focused checks with `node --test tools/gebiz-connector.test.mjs`. These checks passed in this
delivery; they cover D/M/YYYY parsing, provenance/no invented expiry, repeated pagination, partial-source
failure, schema/total/overlap failures, and empty versus incomplete datasets. The additional
[planning validation report](evidence/planning-validation.json) checks the 16-row arithmetic, ten-world
rank/confidence targets, evidence envelopes and local document links. Neither is an application readiness result.
