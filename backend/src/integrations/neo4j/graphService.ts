import { Session, QueryResult, RecordShape } from 'neo4j-driver';
import { getDriver, isNeo4jConnected } from './connection';
import { logger } from '../../utils/logger';

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

  const session: Session = getDriver().session();
  try {
    const result = await session.run<T>(cypher, params);
    return result;
  } catch (error) {
    const err = error as Error;
    logger.error('Neo4j query error', { error: err.message, cypher });
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

/**
 * Ensure Neo4j is reachable. Returns false instead of throwing.
 */
export async function verifyConnectivity(): Promise<boolean> {
  if (!isNeo4jConnected()) return false;
  try {
    await getDriver().verifyConnectivity();
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
  ];

  for (const cypher of constraints) {
    try {
      await runQuery(cypher);
    } catch (error) {
      const err = error as Error;
      logger.warn('Could not apply Neo4j constraint', { cypher, error: err.message });
    }
  }
}
