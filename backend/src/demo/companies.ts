/** Fictional scenarios for explicit local preview. No database or customer data is used. */
export const demoCompanies = [
  {
    _id: 'demo-logistics-001', companyName: 'Meridian Cold Chain (Demo)',
    industry: 'Logistics', country: 'India', headquarters: 'Hyderabad', companyStage: 'Established',
    employeeCount: 850, description: 'Fictional cold-chain operator preparing a Singapore warehouse. Used to demonstrate evidence-based discovery; this is not a verified lead.',
    createdAt: '2026-11-13T00:00:00Z', updatedAt: '2026-11-13T00:00:00Z',
    isMockData: true, relationshipStatus: 'UNKNOWN', sourceReferences: [],
    signals: [
      { _id: 'demo-signal-001', companyId: 'demo-logistics-001', signalType: 'EXPANSION', description: 'Fictional scenario: the operator plans to open its first Singapore warehouse in Q2 2027, linked to its Indian operations.', source: 'Prepared demo scenario - fictional', detectedAt: '2026-11-10T00:00:00Z', confidenceScore: 0 },
      { _id: 'demo-signal-002', companyId: 'demo-logistics-001', signalType: 'TECH_ADOPTION', description: 'Fictional scenario: operations staff want to access the existing shipment platform from the new warehouse. Network design, incumbent suppliers and budget are not known.', source: 'Prepared demo scenario - fictional', detectedAt: '2026-11-11T00:00:00Z', confidenceScore: 0 },
    ],
  },
  {
    _id: 'demo-retail-002', companyName: 'Cedar Retail (Demo)', industry: 'Retail', country: 'Singapore',
    headquarters: 'Singapore', companyStage: 'Established', employeeCount: 120,
    description: 'Fictional retailer with no recent business event. A useful test of the hold/no-fit path.',
    createdAt: '2026-11-13T00:00:00Z', updatedAt: '2026-11-13T00:00:00Z', isMockData: true,
    relationshipStatus: 'UNKNOWN', signals: [], sourceReferences: [],
  },
];

export const demoOpportunities: unknown[] = [];
export function registerShowcaseRecords(profiles: any[], opportunities: any[]) {
  for (const profile of profiles) if (!demoCompanies.some(company => company._id === profile._id)) demoCompanies.push(profile);
  for (const opportunity of opportunities) if (!demoOpportunities.some((row: any) => row._id === opportunity._id)) demoOpportunities.push(opportunity);
}
