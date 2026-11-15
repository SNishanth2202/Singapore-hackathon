# Seven-minute demo and readiness script

**Priority status:** ETLA moves from Normal priority (53) to Urgent (84) to Very urgent (89).
The next-action labels remain Verify, Verify and Pursue. The status filter also includes Low priority
and Irrelevant; thresholds are documented in the README.

The local demo now implements this replay. The queue, buttons and npm verification commands are executable.
See the root README and [delivery notes](lead-ranking-delivery.md) for setup and current validation.

## Preparation

Replay and reset controls are available under **Demo checks**. The main page opens directly onto the queue.

- Use `Lead-Ranking-Agent`, fixture `singtel-demo-v1`, rubric `rubric-v1`, scenarios `scenario-v1`.
- Pin T0 to **15 November 2026, 09:00 SGT**. Load dated public snapshots and stored LLM extractions.
- Prepare isolated run/reset; initially 15 opportunities, with ETLA O01 not yet created. Seed O07 and O15
  independently from mock CRM so they do not secretly leak O01's public trigger into CRM-only discovery.
- Make public and synthetic CRM badges visible. Keep source publication time, snapshot date, queue refresh
  time and demo clock distinct. Close any unrelated app pages; use one queue throughout.
- Target backend commands to implement: `npm run seed:lead-ranking`, `npm run test:ranking`,
  `npm run verify:ranking-demo`; frontend: `npm run test:e2e` and `npm run build`.
- Run the real connector once before presenting, preserve its result, then present using snapshots.
  A live-source failure must be demonstrable without breaking the script.

## Replay sequence

Each control applies an event with the fixed ID below, and returns the complete new queue. The detail
panel displays the changed fact and previous/new actions. Real public observations do not change during
replay; synthetic CRM/engineering events are clearly marked. Use an event cursor rather than random timers.

| Time | Control and event | What judges should see | Narration |
| --- | --- | --- | --- |
| 0:00-0:40 | Reset to T0, 15 rows; open queue | One queue; all statuses remain visible; top-five capacity divider; source dates and last successful refresh | "We rank a specific buying unit, product and window, with the task a rep can do next." |
| 0:40-1:30 | Import public trigger `E0-public-etla` from S01/S02 | O01 is created once: ETLA / Kaki Bukit / new-site managed connection / provisional BW-O01. **Score 53, rank 13, Verify**. Strongest public evidence links to the SGX subsidiary/site filing and EDB Q1 2027 milestone | "The announcement reveals a facility opportunity that was missing from this mock CRM. It does not prove a purchase date or that fibre can be delivered." |
| 1:30-2:25 | Replay mock Salesforce `E1-window-etla`, `BuyingWindowConfirmed` | Synthetic buyer activity and required order notice **23 Nov 2026 09:00 SGT**; O01 becomes **84, rank 3, movement +10, WORK_NOW**, still Verify. Previous `VERIFY_BUYING_WINDOW` -> `VERIFY_SITE`. Highlight timing +16 and readiness +15 | "The CRM event makes the public trigger actionable this week. We still need engineering proof." |
| 2:25-2:55 | Open O01 confidence details | **80/100** ranking confidence = 8/10 scenarios retain WORK_NOW; rank range **1-15**; **30/100** action stability. Three worlds retain Verify, five become Pursue, two become Blocked | "Eighty means eight tested worlds retain the priority band. It is not an eighty-percent chance of winning." |
| 2:55-3:30 | Replay mock `E2-case-micron`, `ServiceCaseOpened` | O02 becomes **Resolve**, names incident owner and SLA deadline; previous pursuit task and new restoration task shown. It remains visible in top five; no arbitrary sales-score bonus | "The next useful action can be resolving a service issue before a renewal conversation." |
| 3:30-4:25 | Replay mock engineering `E3-site-etla`, `SiteAssessmentCompleted` | Exact ETLA premises assessed serviceable by **15 Feb 2027**, technical diverse paths already PASS, notice still future. O01 **89, rank 1, movement +2, Pursue**, ranking **100/100**, range **1-1**, action **100/100**. Old `VERIFY_SITE` -> `PURSUE_NEW_SITE` | "The site assessment changes five fit points, clears a gate and resolves the uncertainty that caused two scenarios to fall out of the working band." |
| 4:25-5:10 | Toggle same queue: CRM-only, CRM+public, deal value | Same opportunity IDs and event cursor. CRM-only marks O01 absent from the original discovery set, removes public-derived need/site claims, and recomputes its Verify action below the top five. Preserve the E1 mock window. CRM+public shows the exact source contribution. Deal-value top five is O15/O12/O09/O16/O08, including waiting/blocked work | "A large deal is not necessarily the most valuable action now. These are controlled fixture comparisons, not a measured sales lift." |
| 5:10-5:40 | Open private 5G O15, replay `E4-5g-latency-fail` | Synthetic mandatory p95 <=20ms, measured 28ms -> **Blocked**; retained below working rows. No inference from WAN serviceability; unknown RF assessment initially Verify | "Different products need different proof. A building with access connectivity is not automatically ready for this private 5G use case." |
| 5:40-6:15 | Replay duplicate E3, then refresh with forced connector timeout | Duplicate leaves same queue/version/movement. Failed refresh preserves last successful rows/time with degraded source badge; no unrelated fallback rows | "The worklist survives missing sources and duplicate events." |
| 6:15-7:00 | Advance to a threshold, then show empty fixture and reset | A required notice crossing expiry blocks that specific opportunity once; initialized empty gives **[]** with a clear empty state. Reset returns original 15 rows and same replay behavior | "Every change has a fact, rule and previous/new action. Nothing new means the same list." |

The precise numbers are fixture acceptance targets defined in [contracts](lead-ranking-contracts.md), not
hardcoded UI text. At E1, O01's ten scenario ranks are `[3,1,1,1,15,15,3,1,3,1]`; after E3 all ten are 1.
Only run the threshold/empty steps after the core comparison has been captured so its cursor stays fixed.

## Reproducible decisive-fact test

Arrange: seed the 16-row E1 state, freeze clock T0, accept the same evidence, leave ETLA's site disputed.
Run all ten scenarios over all rows. Assert score 84, rank 3, Verify, WORK_NOW, retained=8, scenarioCount=10,
rankingConfidence=80, actionConfidence=30, minRank=1, maxRank=15. Verify S4 and S5 fail the site gate.

Act: apply E3 with a unique event ID, versioned mock assessor proof and exact premises, ready-by and
technical references. All scenarios now inherit verified site PASS; other assumptions remain unchanged.
Assert score 89, rank 1, Pursue, retained=10, rankingConfidence=100, actionConfidence=100, range 1-1.
Assert stored previous/new actions and the deciding assessment evidence ID. Reapply E3: exact no-op.
Reload the page/process: persisted order, versions and confidence remain identical.

Counterfactual: reset E1, assess site FAIL -> Blocked even with a high score. Reset again and remove the
assumption bounds -> Insufficient evidence, null numeric stability; also suppress unsupported stability
for potentially displaced competitors. Independent failed-gate rows may retain numeric band stability.

## Required test pack before calling the demo ready

| Test | Assertion |
| --- | --- |
| Repeated reset/replay, offline and online | Same ordered IDs, scores, statuses, actions, scenario outcomes and fingerprint for fixed inputs |
| Duplicate event and changed retry | Same ID/hash no-op; same ID/different payload 409; no extra opportunity or cursor advance |
| Out-of-order events | Older aggregate version or a version gap cannot silently replace a newer assessment |
| Syndication | SGX/EDB/JTC copies of S02 add one need feature and one opportunity; corrected document supersedes |
| Ambiguous match | Add a second synthetic ETLA alias/site candidate; unresolved mapping creates Verify with both candidate IDs |
| Mandatory gate states | Site, technical and deadline tested independently UNKNOWN/FAIL/PASS; failure precedence; an unknown never passes |
| Service case | Open -> Resolve after gates; close -> original commercial task; unrelated site's case leaves O01 unchanged |
| Stale evidence | Age site assessment beyond 30d -> UNKNOWN/Verify; old news does not gain recency on re-fetch |
| Clock edges | Exact 7/30/90/180d boundaries, activity age, due time and expiry; no-op ticks preserve generation |
| Confidence | All ten worlds rerank the full queue, including uncertain and blocked competitors; linked estimates move together |
| No plausible bound | Display Insufficient evidence and the missing assumption, including effects on competitor confidence |
| Connector trouble | Timeout, 429, 500, malformed JSON, missing schema field, second-page failure and changed page totals preserve the last success |
| Zero opportunities | `items: []`, total 0, initialized true, healthy; first-start failure is distinct degraded/uninitialized state |
| Baselines and ablation | Same universe/cursor/clock; public fields masked in CRM-only; remove all mirrors of a provenance group together |
| Browser behavior | Rank/movement/actions/confidence correct after each click, keyboard-readable evidence detail, failure badge and empty state |
| Build and API | TypeScript builds pass; HTTP 4xx/5xx fail checks; endpoint assertions inspect returned values, not just any HTTP response |

Capture a single final readiness report with fixture/rubric/scenario versions, environment, build/test exits,
queue hashes at each cursor, scenario outcomes and the connector's last successful check. Source metrics in the
[enterprise evidence document](lead-ranking-enterprise-evidence.md) are enterprise evidence;
no demo fixture outcome should be presented as Singtel performance.
