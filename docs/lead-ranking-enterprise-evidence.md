# Design decisions and enterprise evidence

Enterprise figures below support the implemented design choices; they are
not Singtel results or forecasts. Mechanisms, reported outcomes, predictive evaluations and targets are
identified separately. The proposed rubric, replay, gates and confidence formula need our own tests.

1. **Rank a specific opportunity with transparent points.**

   **Where the idea came from:** IBM OnTARGET used product-specific propensity scores and separate
   existing-customer and new-prospect models. We borrow that product granularity and extend it to a buying
   unit and window. Georgia-Pacific Pro's implementation partner describes dynamic points in Salesforce;
   we borrow that inspectable points mechanism.
   [IBM: model validation, printed pp.38-39 / PDF pp.6-7](https://s3.us.cloud-object-storage.appdomain.cloud/res-files/0-IBM%20Edelman%20Paper%20Interfaces.pdf#page=6),
   [Georgia-Pacific: Solution](https://www.block-tackle.com/case-study-georgia-pacific-pro-lead-scoring#:~:text=SOLUTION).

   **What the enterprises observed:** IBM's forward validation generally outperformed rankings by company
   size for prospects or prior IBM revenue for customers: a **predictive evaluation**. Georgia-Pacific's
   partner reported **113% higher new-lead sales** after the combined scoring/routing rollout: a **reported
   rollout outcome**, compared with the prior approach; the case does not supply a controlled comparator
   or evaluation window. It does not isolate the scoring weights.
   [Georgia-Pacific: Results](https://www.block-tackle.com/case-study-georgia-pacific-pro-lead-scoring#:~:text=RESULTS).

   **Our implementation:** the 35/25/20/15/5 weights are our assumptions for the value of acting now,
   with component evidence and stable tiebreaks. Tests must reproduce exact component totals and tuple identity.

2. **Turn rank into timely action in one queue.**

   **Where the idea came from:** Georgia-Pacific's Salesforce scores routed work to sales follow-up,
   call-centre outreach or nurturing. ServiceNow surfaced production scoring to sellers for timely action.
   Our event replay and rank-change display are a simplified implementation of actionable, timely routing.
   [Georgia-Pacific: Solution](https://www.block-tackle.com/case-study-georgia-pacific-pro-lead-scoring#:~:text=SOLUTION),
   [ServiceNow: Boosting seller performance and accelerating deal cycles](https://www.microsoft.com/en/customers/story/26532-servicenow-azure#:~:text=Boosting%20seller%20performance%20and%20accelerating%20deal%20cycles).

   **What the enterprises observed:** Georgia-Pacific's **113%** figure covers the combined rollout, not
   routing alone. Microsoft's ServiceNow case reports sellers acting within **24 hours of engagement**
   and prioritized leads **3x as likely to enter the pipeline**. The latter is a **reported pipeline
   comparison** with other leads, not closed-won conversion or a randomized causal estimate; detailed
   comparator construction is not provided.

   **Our implementation:** a CRM event or deadline threshold recomputes the whole queue, showing the fact,
   old/new rank and old/new action. Repeatability, duplicate-event and failure-retention tests establish behavior.

3. **Join public triggers to CRM and test the contribution of each family.**

   **Where the idea came from:** Intel enriched reseller knowledge with websites, CRM and internal signals.
   A Coca-Cola Refreshments study compared data combinations for prospect scoring. We borrow enrichment
   plus explicit comparisons of the information added by each source.
   [Intel: Solution, PDF p.4](https://www.intel.cn/content/dam/www/public/us/en/documents/white-papers/data-mining-using-machine-learning-to-rediscover-customers-paper.pdf#page=4),
   [Intel: Table 7, PDF p.13](https://www.intel.cn/content/dam/www/public/us/en/documents/white-papers/data-mining-using-machine-learning-to-rediscover-customers-paper.pdf#page=13),
   [Coca-Cola Refreshments: Chapter 4, Table 4.3, printed p.136 / PDF p.148](https://backoffice.biblio.ugent.be/download/8566527/8566528#page=148).

   **What the enterprises observed:** Intel's selected cohort recorded **12.9% email click-through versus
   5.1%** for a randomly selected comparison group with similar high-level characteristics: an **engagement
   result**. Coca-Cola's **top 5% of scored prospects** had **14.1% conversion with commercial plus website
   data versus 10.2% with commercial data alone**, in cross-validation: **predictive performance**, not a
   deployed sales uplift. Chapter 4 describes repeated twofold cross-validation.

   **Our implementation:** exact source URLs, dates, excerpts, entity/site matches and claim status;
   one live connector plus cited snapshots; CRM-only and leave-one-source-family-out comparisons with
   syndicated copies grouped together. Our fixture comparisons do not estimate real conversion lift.

4. **Check fulfilment and procurement before pursuing an offer.**

   **Where the idea came from:** StarHub's announced Totogi project connects call capture, CRM and quoting
   with product/fulfilment knowledge. BT Business uses current products, pricing and customer context to
   recommend a specific offer. We borrow fulfilment-aware gating from StarHub and contextual offer selection
   from BT.
   [StarHub/Totogi announcement](https://www.telecomtv.com/content/digital-platforms-services/starhub-partners-with-totogi-to-increase-sales-effectiveness-through-higher-sales-conversion-54840/#:~:text=unify%20call%20capture),
   [BT Business: The Solution](https://www.pega.com/customers/bt-business-customer-decision-hub#:~:text=The%20Solution).

   **What the enterprises observed or targeted:** StarHub's **up-to-10% conversion improvement** was an
   **announced target**, not a measured result. Pega reports **2x conversion against historical benchmarks**
   for selected BT upsell campaigns: a **reported historical comparison** for the broader campaign approach.
   It does not isolate a site, SLA or deadline gate.
   [BT Business: The Results](https://www.pega.com/customers/bt-business-customer-decision-hub#:~:text=The%20Results).

   **Our implementation:** explicit site, mandatory technical and deadline checks; UNKNOWN -> Verify,
   confirmed FAIL -> Blocked; all PASS permits Pursue in an active window. Mock route diversity and private
   5G latency requirements remain labelled. Tests must independently verify each gate and transition.

5. **Show evidence and scenario-based ranking confidence.**

   **Where the idea came from:** IBM's rep interface exposed underlying account data with its product
   propensity outputs. We borrow the precedent for showing the basis of a score inside the work tool.
   [IBM: OnTARGET Website, printed p.39 / PDF p.7](https://s3.us.cloud-object-storage.appdomain.cloud/res-files/0-IBM%20Edelman%20Paper%20Interfaces.pdf#page=7).

   **What the enterprise observed:** IBM recorded **6,454 unique users in 2008**: an **adoption observation**,
   with no comparator required for that count. It is not evidence for our confidence formula.
   [IBM: Tool Adoption, printed p.40 / PDF p.8](https://s3.us.cloud-object-storage.appdomain.cloud/res-files/0-IBM%20Edelman%20Paper%20Interfaces.pdf#page=8).

   **Our implementation:** the ten-world priority-band retention formula is **our prototype design**.
   Re-rank the whole queue with correlated uncertainties, show numeric stability wherever supported,
   and use Insufficient evidence otherwise. The reproducible decisive-fact test disputes ETLA's site,
   then verifies it: target ranking confidence **80/100 -> 100/100**, alongside changed action and rank.
   This demonstrates scenario stability and requires our own tests; it is not an IBM validation result.
