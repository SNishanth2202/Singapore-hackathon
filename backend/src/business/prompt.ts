import { BusinessKnowledge } from './schema';
import { CandidateMatch } from './matching';

export function buildBusinessContext(knowledge: BusinessKnowledge, candidates: CandidateMatch[]) {
  const candidateIds = new Set(candidates.map((c) => c.offeringId));
  return {
    knowledgeVersion: knowledge.version, seller: knowledge.seller,
    strategy: knowledge.strategy,
    evidencePolicy: knowledge.evidencePolicy,
    // All active areas are visible; detailed discovery guidance is sent for eligible candidates.
    catalogue: knowledge.offerings.filter((o) => o.active).map((o) => ({
      id: o.id, name: o.name, category: o.category, capabilities: o.capabilities, sourceIds: o.sourceIds,
      ...(candidateIds.has(o.id) ? { customerProblems: o.customerProblems, buyerRoles: o.buyerRoles,
        targetSegmentIds: o.targetSegmentIds, discoveryQuestions: o.discoveryQuestions, availability: o.availability,
        discoveryRules: o.discoveryRules } : {}),
    })),
    candidateMatches: candidates,
    sellerSources: knowledge.sources,
    constraints: {
      relationshipStatus: 'UNKNOWN',
      strategyIsOfficialSellerPolicy: false,
      candidateMatchesProveDemand: false,
      capabilityAvailabilityRequiresVerification: true,
    },
  };
}
