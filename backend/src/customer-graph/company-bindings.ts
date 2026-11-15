/**
 * Account identity bindings into the existing Company graph. Real connectors must provide the
 * verified Company.companyId; they must never merge companies by a model-inferred name.
 * These reserved IDs identify only the two explicitly fictional demo customers.
 * Kept outside extraction inputs so historical model responses remain replayable.
 */
export const companyBindings = [
  { accountId: 'meridian', companyId: 'demo:customer:meridian', companyName: 'Meridian Logistics', country: 'Singapore', industry: 'Logistics & supply chain' },
  { accountId: 'harbour', companyId: 'demo:customer:harbour', companyName: 'Harbour Precision', country: 'Singapore', industry: 'Advanced manufacturing' },
];
