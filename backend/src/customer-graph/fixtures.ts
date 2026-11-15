import { Account, Artifact, Entity, SourceKind } from './contracts';

export const accounts: Account[] = [
  { id: 'meridian', name: 'Meridian Logistics', industry: 'Logistics & supply chain', initials: 'ML', description: 'A renewal, an unresolved warehouse incident, and a new distribution hub.' },
  { id: 'harbour', name: 'Harbour Precision', industry: 'Advanced manufacturing', initials: 'HP', description: 'A growing production site with capacity pressure and an upcoming audit.' },
];
export const entities: Entity[] = [
  { id: 'meridian', accountId: 'meridian', kind: 'Account', label: 'Meridian Logistics', description: 'Fictional existing enterprise customer; Singapore.' },
  { id: 'meridian-maya', accountId: 'meridian', kind: 'Person', label: 'Maya Tan', description: 'IT Director; technical sponsor.' },
  { id: 'meridian-daniel', accountId: 'meridian', kind: 'Person', label: 'Daniel Lim', description: 'Finance Director; commercial approver.' },
  { id: 'meridian-jurong', accountId: 'meridian', kind: 'Site', label: 'Jurong warehouse', description: 'Existing distribution warehouse.' },
  { id: 'meridian-tuas', accountId: 'meridian', kind: 'Site', label: 'Tuas distribution hub', description: 'Planned new hub; serviceability is unverified.' },
  { id: 'meridian-wan', accountId: 'meridian', kind: 'Service', label: 'Managed WAN · ML-WAN-01', description: 'Existing 200 Mbps managed connection at Jurong.' },
  { id: 'meridian-contract', accountId: 'meridian', kind: 'Contract', label: 'Contract ML-2024-018', description: 'Executed managed WAN order form.' },
  { id: 'meridian-ticket', accountId: 'meridian', kind: 'Ticket', label: 'Ticket SUP-4821', description: 'Open packet-loss incident at Jurong.' },
  { id: 'meridian-invoice', accountId: 'meridian', kind: 'Invoice', label: 'Invoice INV-ML-1101', description: 'November recurring service invoice.' },
  { id: 'harbour', accountId: 'harbour', kind: 'Account', label: 'Harbour Precision', description: 'Fictional existing enterprise customer; Singapore.' },
  { id: 'harbour-alex', accountId: 'harbour', kind: 'Person', label: 'Alex Koh', description: 'Head of Infrastructure; technical sponsor.' },
  { id: 'harbour-priya', accountId: 'harbour', kind: 'Person', label: 'Priya Menon', description: 'CFO; budget approver.' },
  { id: 'harbour-woodlands', accountId: 'harbour', kind: 'Site', label: 'Woodlands plant', description: 'Existing production site.' },
  { id: 'harbour-network', accountId: 'harbour', kind: 'Service', label: 'Business Internet · HP-NET-02', description: 'Existing 500 Mbps internet connection.' },
  { id: 'harbour-contract', accountId: 'harbour', kind: 'Contract', label: 'Contract HP-2025-007', description: 'Executed internet service order.' },
  { id: 'harbour-ticket', accountId: 'harbour', kind: 'Ticket', label: 'Ticket SUP-5096', description: 'Capacity investigation; workaround supplied.' },
  { id: 'harbour-invoice', accountId: 'harbour', kind: 'Invoice', label: 'Invoice INV-HP-1101', description: 'November internet invoice, paid.' },
];
const make = (id: string, accountId: string, source: SourceKind, format: Artifact['format'], title: string, occurredAt: string,
  metadata: Record<string, string>, content: string): Artifact => ({ id, accountId, source, format, title, occurredAt,
    filename: `${id}.${format === 'email' ? 'eml' : format === 'calendar' ? 'ics' : 'txt'}`, metadata, content, synthetic: true });

export const artifacts: Artifact[] = [
  make('ml-crm', 'meridian', 'salesforce', 'record', 'Account & opportunity snapshot', '2026-11-13T09:00:00+08:00',
    { System: 'Salesforce · mock export', Account: 'ACC-ML-001', Owner: 'Cheryl Wong', Stage: 'Discovery' },
`MOCK SALESFORCE EXPORT — ALL PEOPLE, RECORDS AND COMMERCIAL TERMS ARE FICTIONAL
Account: Meridian Logistics Pte. Ltd. | Account ID: ACC-ML-001
Relationship: Existing customer | Industry: Logistics | Country: Singapore
Account owner: Cheryl Wong | Business unit: Enterprise connectivity
Technical sponsor: Maya Tan, IT Director, maya.tan@meridian.example
Commercial approver: Daniel Lim, Finance Director, daniel.lim@meridian.example
Existing site: Jurong warehouse | Proposed site: Tuas distribution hub
Opportunity: Managed WAN renewal and new Tuas connection | Stage: Discovery
CRM renewal date: 2027-02-28 (manually entered; contract not yet reconciled)
Estimated new-site budget: SGD 3,000/month; not approved.
Next step: Review the signed contract and outstanding Jurong incident before quoting.`),
  make('ml-call', 'meridian', 'calls', 'transcript', 'Discovery call · Tuas hub & renewal', '2026-11-11T10:00:00+08:00',
    { Participants: 'Maya Tan · Cheryl Wong', Duration: '24 minutes', Recorder: 'Sales call · mock transcript' },
`MOCK SALES-CALL TRANSCRIPT | 11 November 2026, 10:00 SGT
00:00 Cheryl Wong: Thanks, Maya. What is changing in your network?
00:42 Maya Tan: The Tuas distribution hub must have connectivity ready by 15 January 2027. We expect 80 staff and real-time warehouse scanning.
02:10 Maya Tan: Jurong is still on a 200 Mbps managed WAN. During the evening shift the scanning system freezes when the link drops packets.
04:22 Cheryl Wong: Is this linked to SUP-4821?
04:35 Maya Tan: Yes. Please resolve SUP-4821 before we discuss expanding the agreement. Reliability comes first.
07:18 Maya Tan: We need a resilient primary connection and a separate backup path for Tuas. Please check coverage; we have not confirmed fibre availability.
11:02 Maya Tan: Daniel Lim signs off commercial spend. I can validate the technical design, but I cannot approve the budget.
16:40 Cheryl Wong: I will arrange an engineer review and bring a serviceability assessment to our next meeting.
19:05 Maya Tan: We are evaluating options. We have not selected a provider for Tuas.`),
  make('ml-email', 'meridian', 'email_calendar', 'email', 'RE: Tuas connectivity · decision criteria', '2026-11-12T14:32:00+08:00',
    { From: 'Maya Tan <maya.tan@meridian.example>', To: 'Cheryl Wong <cheryl.wong@seller.example>', Cc: 'Daniel Lim <daniel.lim@meridian.example>', Subject: 'RE: Tuas connectivity · decision criteria' },
`From: Maya Tan <maya.tan@meridian.example>
To: Cheryl Wong <cheryl.wong@seller.example>
Cc: Daniel Lim <daniel.lim@meridian.example>
Date: Thu, 12 Nov 2026 14:32:00 +0800
Subject: RE: Tuas connectivity - decision criteria
X-Demo: Fictional customer email

Hi Cheryl,

Confirming the Tuas ready-by date is 15 January 2027. Please send the serviceability assessment by 20 November 2026.

Our two requirements are resilient connectivity and a backup route independent of the primary path. An ordinary second circuit on the same path will not meet the requirement.

Daniel needs a priced proposal before he can approve spend. The SGD 3,000/month figure in your CRM is only a planning placeholder, not an approved budget.

Please include the resolution plan for SUP-4821. We will not commit to the expansion until the Jurong reliability issue is addressed.

Regards,
Maya

[All addresses and content are synthetic demo data.]`),
  make('ml-calendar', 'meridian', 'email_calendar', 'calendar', 'Technical & commercial review', '2026-11-13T16:00:00+08:00',
    { Organizer: 'Cheryl Wong', Attendees: 'Maya Tan · Daniel Lim · Cheryl Wong', Meeting: '19 Nov 2026 · 10:00–10:45 SGT' },
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Singtel Scout//Synthetic Demo//EN
BEGIN:VEVENT
UID:ml-review-20261119@demo.example
DTSTAMP:20261113T080000Z
DTSTART:20261119T020000Z
DTEND:20261119T024500Z
SUMMARY:Meridian technical and commercial review
ORGANIZER:mailto:cheryl.wong@seller.example
ATTENDEE:mailto:maya.tan@meridian.example
ATTENDEE:mailto:daniel.lim@meridian.example
DESCRIPTION:Review SUP-4821 remediation\, signed renewal terms and Tuas serviceability. Daniel Lim has accepted. No purchase decision is recorded.
END:VEVENT
END:VCALENDAR`),
  make('ml-support', 'meridian', 'support', 'ticket', 'SUP-4821 · recurring warehouse packet loss', '2026-11-14T11:20:00+08:00',
    { Ticket: 'SUP-4821', Status: 'Open · investigating', Priority: 'P2 · high', Assignee: 'Network assurance', Service: 'ML-WAN-01' },
`MOCK SUPPORT TICKET SUP-4821
Organization: Meridian Logistics | Site: Jurong warehouse | Service: ML-WAN-01
Opened: 9 November 2026, 18:40 SGT | Status: OPEN | Priority: P2
Customer impact: Warehouse scanners intermittently lose connection during 18:00–22:00 shifts.
9 Nov / Maya Tan: We measured 3.2% packet loss during the evening peak. This is disrupting order scanning.
10 Nov / Network assurance: Remote checks show recurring loss. Root cause is not confirmed. Engineer visit scheduled for 16 November 2026.
12 Nov / Maya Tan: Please provide a remediation plan before our expansion review.
14 Nov / Network assurance: Incident remains open. No permanent fix has been validated. Next customer update due 16 November 2026, 12:00 SGT.
SLA credit: Under review; no credit has been approved.`),
  make('ml-contract', 'meridian', 'contracts', 'contract', 'Executed WAN order · ML-2024-018', '2024-12-01T09:00:00+08:00',
    { Contract: 'ML-2024-018', Status: 'Executed · mock', Parties: 'Meridian Logistics · demo seller', Service: 'ML-WAN-01' },
`FICTIONAL EXECUTED SERVICE ORDER ML-2024-018
Customer: Meridian Logistics Pte. Ltd. | Customer ID: ACC-ML-001
Covered site: Jurong warehouse | Service: ML-WAN-01, managed WAN, 200 Mbps
Service commencement: 1 January 2025
Fixed term ends: 31 January 2027.
Renewal: Renews for twelve months unless written non-renewal notice is received by 2 December 2026.
Recurring service charge: SGD 4,800 per month, excluding GST.
Availability commitment: 99.9% monthly service availability, subject to the exclusions in this fictional agreement.
Scope: This order covers Jurong only. A Tuas service, diverse backup path, or bandwidth upgrade requires a separate signed order.
Authorized customer signatory: Daniel Lim, Finance Director.
This signed-order mock takes precedence over manually entered CRM term dates.`),
  make('ml-billing', 'meridian', 'billing', 'invoice', 'November invoice & disputed charge', '2026-11-14T08:00:00+08:00',
    { Invoice: 'INV-ML-1101', Currency: 'SGD', Status: 'Partially paid · disputed item', Account: 'ACC-ML-001' },
`MOCK BILLING LEDGER | Snapshot: 14 November 2026
Invoice: INV-ML-1101 | Customer: Meridian Logistics | Billing period: November 2026
Recurring charge for ML-WAN-01: SGD 4,800.00 excluding GST.
One-off site work charge: SGD 1,200.00 excluding GST.
Subtotal: SGD 6,000.00 | GST 9%: SGD 540.00 | Invoice total: SGD 6,540.00.
Due date: 10 November 2026.
Payment received: SGD 5,232.00 on 9 November 2026.
Outstanding: SGD 1,308.00 including GST. This is the disputed one-off site work charge, not an unpaid recurring service charge.
Customer dispute: Daniel Lim requested the work acceptance record. Finance is investigating.
SLA credit for SUP-4821: Pending assessment, not issued.
No service suspension is scheduled.`),
  make('ml-inventory', 'meridian', 'services_usage', 'inventory', 'Installed services · Jurong & Tuas', '2026-11-14T07:00:00+08:00',
    { System: 'Service inventory · mock', Account: 'ACC-ML-001', Sites: 'Jurong · Tuas' },
`MOCK SERVICE INVENTORY | 14 November 2026
Customer: Meridian Logistics
ML-WAN-01 | Site: Jurong warehouse | Managed WAN | 200 Mbps | Active | Contract: ML-2024-018
Backup connectivity at Jurong: No backup service recorded in this inventory.
Tuas distribution hub: No installed or ordered service is recorded.
Tuas fibre serviceability: Not assessed. No delivery commitment exists.
Inventory describes this seller's recorded services only; it does not establish whether the customer has services from other providers.`),
  make('ml-usage', 'meridian', 'services_usage', 'usage', 'WAN utilization · 7-day report', '2026-11-14T07:30:00+08:00',
    { Service: 'ML-WAN-01', Window: '7–13 Nov 2026', Site: 'Jurong warehouse', Measure: '5-minute samples' },
`MOCK SERVICE TELEMETRY | Meridian Logistics | ML-WAN-01
Window: 7–13 November 2026 | Installed bandwidth: 200 Mbps
95th-percentile inbound utilization: 91% of provisioned bandwidth.
Evening peak utilization: 97% | Evening packet loss maximum: 3.2%.
Three evening intervals exceeded the monitoring packet-loss threshold.
These observations support a capacity investigation but do not establish the cause of SUP-4821.
No telemetry exists for the Tuas hub because no service is installed there.`),
  make('hp-crm', 'harbour', 'salesforce', 'record', 'Account & expansion opportunity', '2026-11-13T10:00:00+08:00',
    { System: 'Salesforce · mock export', Account: 'ACC-HP-002', Owner: 'Ethan Lee', Stage: 'Technical evaluation' },
`MOCK SALESFORCE EXPORT — ALL RECORDS ARE FICTIONAL
Account: Harbour Precision Pte. Ltd. | Account ID: ACC-HP-002
Relationship: Existing customer | Industry: Advanced manufacturing | Site: Woodlands plant
Account owner: Ethan Lee
Technical sponsor: Alex Koh, Head of Infrastructure, alex.koh@harbour.example
Budget approver: Priya Menon, CFO, priya.menon@harbour.example
Installed service: HP-NET-02, Business Internet, 500 Mbps
Opportunity: Upgrade connectivity for new machine-vision line | Stage: Technical evaluation
Indicative upgrade budget: Not recorded. No purchase order exists.
Next step: Validate throughput needs, resilience requirements and delivery lead time.`),
  make('hp-call', 'harbour', 'calls', 'transcript', 'Factory expansion · technical discovery', '2026-11-10T15:00:00+08:00',
    { Participants: 'Alex Koh · Ethan Lee', Duration: '18 minutes', Recorder: 'Sales call · mock transcript' },
`MOCK SALES-CALL TRANSCRIPT | 10 November 2026, 15:00 SGT
00:30 Alex Koh: The new machine-vision production line starts on 4 January 2027. It will upload inspection images to our cloud system.
02:12 Alex Koh: The current 500 Mbps line is near capacity when image backups overlap the production shift.
04:20 Ethan Lee: Would a 1 Gbps service resolve the requirement?
04:38 Alex Koh: It is an option to evaluate, not an approved solution. We also need a resilient backup, and we need to confirm upload throughput with engineering.
08:10 Alex Koh: Priya Menon owns the budget. She wants a technical assessment and two priced options before approving anything.
12:14 Alex Koh: We have a customer assurance audit on 15 December 2026. Please bring the continuity design to the review before then.
15:10 Ethan Lee: We will assess capacity and a diverse backup option. No delivery date has been committed.`),
  make('hp-email', 'harbour', 'email_calendar', 'email', 'Capacity assessment & priced options', '2026-11-12T09:15:00+08:00',
    { From: 'Priya Menon <priya.menon@harbour.example>', To: 'Ethan Lee <ethan.lee@seller.example>', Cc: 'Alex Koh <alex.koh@harbour.example>', Subject: 'Capacity assessment & priced options' },
`From: Priya Menon <priya.menon@harbour.example>
To: Ethan Lee <ethan.lee@seller.example>
Cc: Alex Koh <alex.koh@harbour.example>
Date: Thu, 12 Nov 2026 09:15:00 +0800
Subject: Capacity assessment and priced options
X-Demo: Fictional customer email

Hi Ethan,

Please send the engineering assessment and two priced options by 23 November 2026: a bandwidth upgrade alone, and an upgrade with an independent backup path.

The production line starts on 4 January 2027. We need a realistic installation schedule and clarity on any contract amendment.

I have not approved a budget or selected a solution. Alex will sign off technical suitability; I will approve the commercial proposal.

Regards,
Priya

[Synthetic demo data.]`),
  make('hp-calendar', 'harbour', 'email_calendar', 'calendar', 'Capacity & business continuity workshop', '2026-11-13T13:00:00+08:00',
    { Organizer: 'Ethan Lee', Attendees: 'Alex Koh · Priya Menon · Ethan Lee', Meeting: '20 Nov 2026 · 14:00–15:00 SGT' },
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Singtel Scout//Synthetic Demo//EN
BEGIN:VEVENT
UID:hp-workshop-20261120@demo.example
DTSTAMP:20261113T050000Z
DTSTART:20261120T060000Z
DTEND:20261120T070000Z
SUMMARY:Harbour capacity and business continuity workshop
ORGANIZER:mailto:ethan.lee@seller.example
ATTENDEE:mailto:alex.koh@harbour.example
ATTENDEE:mailto:priya.menon@harbour.example
DESCRIPTION:Review upload requirements\, independent backup design and audit evidence for 15 December 2026. Both customer attendees accepted. Proposal deadline is 23 November 2026.
END:VEVENT
END:VCALENDAR`),
  make('hp-support', 'harbour', 'support', 'ticket', 'SUP-5096 · slow inspection-image uploads', '2026-11-13T17:30:00+08:00',
    { Ticket: 'SUP-5096', Status: 'Monitoring · workaround applied', Priority: 'P3 · normal', Assignee: 'Service engineering', Service: 'HP-NET-02' },
`MOCK SUPPORT TICKET SUP-5096
Organization: Harbour Precision | Site: Woodlands plant | Service: HP-NET-02
Opened: 6 November 2026 | Status: MONITORING | Priority: P3
Alex Koh: Inspection-image uploads slow down when backups run between 14:00 and 17:00.
Engineering, 8 Nov: No link fault was observed during the sampled window. High outbound utilization overlaps the reported slowdown.
Workaround, 9 Nov: Customer moved bulk backups outside the production shift. Upload times improved.
13 Nov: Capacity assessment is still required before the new line goes live. The workaround does not establish that the current service can support the expanded workload.
No SLA breach or service credit has been confirmed.`),
  make('hp-contract', 'harbour', 'contracts', 'contract', 'Internet order · HP-2025-007', '2025-06-01T09:00:00+08:00',
    { Contract: 'HP-2025-007', Status: 'Executed · mock', Service: 'HP-NET-02' },
`FICTIONAL EXECUTED SERVICE ORDER HP-2025-007
Customer: Harbour Precision Pte. Ltd. | Account ID: ACC-HP-002
Site: Woodlands plant | Service: HP-NET-02 | Business Internet, 500 Mbps
Term: 1 July 2025 to 30 June 2027.
Recurring charge: SGD 2,200 per month, excluding GST.
Bandwidth changes require a signed service amendment and a new technical feasibility check.
No independent backup service is included in this order.
Any delivery lead time must be confirmed after engineering validation; this agreement promises no upgrade installation date.
Commercial approver: Priya Menon.`),
  make('hp-billing', 'harbour', 'billing', 'invoice', 'November invoice · paid in full', '2026-11-13T08:00:00+08:00',
    { Invoice: 'INV-HP-1101', Currency: 'SGD', Status: 'Paid in full', Account: 'ACC-HP-002' },
`MOCK BILLING LEDGER | Snapshot: 13 November 2026
Invoice: INV-HP-1101 | Customer: Harbour Precision | Service: HP-NET-02
November recurring charge: SGD 2,200.00 excluding GST.
GST 9%: SGD 198.00 | Invoice total: SGD 2,398.00.
Due date: 20 November 2026.
Payment: SGD 2,398.00 received on 12 November 2026. Status: PAID IN FULL.
Outstanding balance: SGD 0.00. No billing dispute is recorded.
This payment does not indicate approval of the proposed upgrade.`),
  make('hp-inventory', 'harbour', 'services_usage', 'inventory', 'Installed services · Woodlands plant', '2026-11-14T07:00:00+08:00',
    { System: 'Service inventory · mock', Account: 'ACC-HP-002', Site: 'Woodlands plant' },
`MOCK SERVICE INVENTORY | 14 November 2026
Customer: Harbour Precision | Site: Woodlands plant
HP-NET-02 | Business Internet | 500 Mbps | Active | Contract HP-2025-007
Independent backup service: None recorded in this seller's inventory.
Upgrade order: None recorded. 1 Gbps serviceability and installation lead time are not yet validated.
Managed security service: None recorded in this inventory; this does not prove the customer has no security controls or other providers.`),
  make('hp-usage', 'harbour', 'services_usage', 'usage', 'Internet utilization · 7-day report', '2026-11-14T07:30:00+08:00',
    { Service: 'HP-NET-02', Window: '7–13 Nov 2026', Site: 'Woodlands plant', Measure: '5-minute samples' },
`MOCK SERVICE TELEMETRY | Harbour Precision | HP-NET-02
Window: 7–13 November 2026 | Installed bandwidth: 500 Mbps
95th-percentile outbound utilization: 94% of provisioned bandwidth.
Peak outbound utilization: 99% during bulk image backup.
Availability: 100% during this sampled window; this is not a forecast or a full-month SLA measurement.
After backup rescheduling, peak production-shift utilization fell to 81%.
The new machine-vision line is not live; its incremental traffic is not in these measurements.
Engineering must size the future workload before recommending a bandwidth tier.`),
];
