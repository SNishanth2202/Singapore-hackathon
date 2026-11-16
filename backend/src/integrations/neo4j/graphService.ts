import { Session, QueryResult, RecordShape } from 'neo4j-driver';
import { getDriver, isNeo4jConnected } from './connection';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';

export interface CompanyNodeProps {
  companyId: string;
  companyName: string;
  country: string;
  industry: string;
  companyStage: string;
  website?: string;
  description?: string;
  employeeCount?: number;
}

export interface RelationshipProps {
  [key: string]: string | number | boolean | null;
}

/**
 * Run a Cypher query and return the result. Throws if Neo4j is not connected.
 */
export async function runQuery<T extends RecordShape = RecordShape>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<QueryResult<T>> {
  if (!isNeo4jConnected()) {
    throw new Error('Neo4j is not connected');
  }

  const session: Session = getDriver().session({ database: env.NEO4J_DATABASE });
  try {
    return await session.run<T>(cypher, params);
  } catch (error) {
    logger.error('Neo4j query failed');
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Create (or merge) a Company node in Neo4j and related Country/Industry nodes.
 */
export async function createCompanyNode(company: CompanyNodeProps): Promise<void> {
  const cypher = `
    MERGE (c:Company { companyId: $companyId })
    SET c.companyName  = $companyName,
        c.industry     = $industry,
        c.companyStage = $companyStage,
        c.website      = $website,
        c.description  = $description,
        c.employeeCount= $employeeCount

    MERGE (country:Country { name: $country })
    MERGE (industry:Industry { name: $industry })

    MERGE (c)-[:OPERATES_IN]->(country)
    MERGE (c)-[:BELONGS_TO]->(industry)
  `;

  await runQuery(cypher, {
    companyId:    company.companyId,
    companyName:  company.companyName,
    country:      company.country,
    industry:     company.industry,
    companyStage: company.companyStage,
    website:      company.website ?? null,
    description:  company.description ?? null,
    employeeCount: company.employeeCount ?? null,
  });

  logger.debug('Created/merged company node in Neo4j', { companyId: company.companyId });
}

/**
 * Create a typed relationship between two Company nodes (by companyId).
 */
export async function createRelationship(
  fromId: string,
  toId: string,
  type: string,
  props: RelationshipProps = {}
): Promise<void> {
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(type) || Object.keys(props).some(key => !/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(key))) {
    throw new Error('Invalid graph relationship type or property name');
  }
  const setParts = Object.keys(props)
    .map((k) => `r.${k} = $${k}`)
    .join(', ');

  const cypher = `
    MATCH (a:Company { companyId: $fromId })
    MATCH (b:Company { companyId: $toId })
    MERGE (a)-[r:${type}]->(b)
    ${setParts ? `SET ${setParts}` : ''}
  `;

  await runQuery(cypher, { fromId, toId, ...props });
  logger.debug('Created relationship in Neo4j', { fromId, toId, type });
}

/** Store a verified customer requirement with its source interaction while retaining earlier graph facts. */
export async function linkSalesRequirement(input: {
  companyId: string; companyName: string; opportunityId?: string; requirementId: string; text: string; sourceMessageId: string;
}) {
  const cypher = [
    'MERGE (c:Company { companyId: $companyId })',
    'ON CREATE SET c.companyName = $companyName',
    'MERGE (r:Requirement { requirementId: $requirementId })',
    'SET r.text = $text, r.verifiedByCustomer = true, r.sourceMessageId = $sourceMessageId',
    'MERGE (i:SalesInteraction { messageId: $sourceMessageId })',
    'MERGE (c)-[:HAS_REQUIREMENT]->(r)',
    'MERGE (r)-[:REVEALED_BY]->(i)',
    'WITH c, r',
    'OPTIONAL MATCH (o:Opportunity { opportunityId: $opportunityId })',
    'FOREACH (item IN CASE WHEN o IS NULL THEN [] ELSE [o] END | MERGE (item)-[:HAS_REQUIREMENT]->(r))',
    'RETURN c.companyId AS companyId',
  ].join('\n');
  await runQuery(cypher, input);
}

/**
 * Record one conversation interaction: Company → Contact → Opportunity → Requirement → Singtel Service,
 * and Company → Email Thread → Interaction. MERGE keeps earlier facts; only properties of this interaction are set.
 */
export async function linkSalesConversation(input: {
  companyId: string; companyName: string; contactId?: string; opportunityId?: string; threadId: string;
  messageId: string; direction: 'INBOUND' | 'OUTBOUND'; at: string; intent?: string;
  requirements: { requirementId: string; text: string; serviceIds: string[] }[];
}) {
  const cypher = [
    'MERGE (c:Company { companyId: $companyId })',
    'ON CREATE SET c.companyName = $companyName',
    'MERGE (t:EmailThread { threadId: $threadId })',
    'MERGE (c)-[:HAS_EMAIL_THREAD]->(t)',
    'MERGE (i:SalesInteraction { messageId: $messageId })',
    'SET i.direction = $direction, i.at = $at, i.intent = $intent',
    'MERGE (t)-[:CONTAINS]->(i)',
    'FOREACH (cid IN CASE WHEN $contactId IS NULL THEN [] ELSE [$contactId] END |',
    '  MERGE (p:Contact { contactId: cid }) MERGE (c)-[:HAS_CONTACT]->(p) MERGE (p)-[:PARTICIPATES_IN]->(t))',
    'FOREACH (oid IN CASE WHEN $opportunityId IS NULL THEN [] ELSE [$opportunityId] END |',
    '  MERGE (o:Opportunity { opportunityId: oid }) MERGE (c)-[:HAS_OPPORTUNITY]->(o))',
    'WITH c, i',
    'UNWIND $requirements AS req',
    'MERGE (r:Requirement { requirementId: req.requirementId })',
    'SET r.text = req.text, r.verifiedByCustomer = true, r.sourceMessageId = $messageId',
    'MERGE (c)-[:HAS_REQUIREMENT]->(r)',
    'MERGE (r)-[:REVEALED_BY]->(i)',
    'FOREACH (sid IN req.serviceIds | MERGE (s:SingtelService { serviceId: sid }) MERGE (r)-[:ADDRESSED_BY]->(s))',
    'WITH c, r',
    'OPTIONAL MATCH (c)-[:HAS_OPPORTUNITY]->(o:Opportunity { opportunityId: $opportunityId })',
    'FOREACH (item IN CASE WHEN o IS NULL THEN [] ELSE [o] END | MERGE (item)-[:HAS_REQUIREMENT]->(r))',
    'RETURN count(r) AS linked',
  ].join('\n');
  await runQuery(cypher, { ...input, contactId: input.contactId ?? null, opportunityId: input.opportunityId ?? null, intent: input.intent ?? null });
}

/**
 * Ensure Neo4j is reachable. Returns false instead of throwing.
 */
export async function verifyConnectivity(): Promise<boolean> {
  if (!isNeo4jConnected()) return false;
  try {
    const session = getDriver().session({ database: env.NEO4J_DATABASE, defaultAccessMode: 'READ' });
    try { await session.executeRead(tx => tx.run('RETURN 1 AS ready')); }
    finally { await session.close(); }
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply uniqueness constraints required by the graph model.
 * Safe to call multiple times (uses CREATE CONSTRAINT IF NOT EXISTS).
 */
export async function applyConstraints(): Promise<void> {
  const constraints = [
    'CREATE CONSTRAINT company_id_unique IF NOT EXISTS FOR (c:Company) REQUIRE c.companyId IS UNIQUE',
    'CREATE CONSTRAINT country_name_unique IF NOT EXISTS FOR (c:Country) REQUIRE c.name IS UNIQUE',
    'CREATE CONSTRAINT industry_name_unique IF NOT EXISTS FOR (i:Industry) REQUIRE i.name IS UNIQUE',
    'CREATE CONSTRAINT snapshot_id_unique IF NOT EXISTS FOR (s:ResearchSnapshot) REQUIRE s.id IS UNIQUE',
    'CREATE CONSTRAINT source_revision_unique IF NOT EXISTS FOR (s:EvidenceSource) REQUIRE s.id IS UNIQUE',
    'CREATE CONSTRAINT event_revision_unique IF NOT EXISTS FOR (e:BusinessEvent) REQUIRE e.id IS UNIQUE',
    'CREATE CONSTRAINT customergraphnode_unique IF NOT EXISTS FOR (n:CustomerGraphNode) REQUIRE n.uid IS UNIQUE',
    'CREATE CONSTRAINT customergraphdataset_unique IF NOT EXISTS FOR (n:CustomerGraphDataset) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT customergraphingestion_unique IF NOT EXISTS FOR (n:CustomerGraphIngestion) REQUIRE n.id IS UNIQUE',
  ];

  for (const cypher of constraints) {
    try {
      await runQuery(cypher);
    } catch (error) {
      logger.error('Could not apply required Neo4j constraints');
      throw error;
    }
  }
}
