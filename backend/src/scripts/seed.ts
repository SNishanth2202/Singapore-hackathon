/**
 * ============================================================
 *  SEED DATA — FOR TESTING ONLY. NOT REAL COMPANIES.
 * ============================================================
 *
 * Inserts 5 fictional sample companies into MongoDB and
 * creates corresponding Neo4j nodes + relationships.
 *
 * Usage:  pnpm run seed
 */

import { createHash } from 'node:crypto';
import { closeDatabases } from '../config/database';
import { logger } from '../utils/logger';
import { Company } from '../models/Company';
import { IntelligenceSignal } from '../models/IntelligenceSignal';
import { Opportunity } from '../models/Opportunity';
import { connectMongoDB } from '../integrations/mongodb/connection';
import { connectNeo4j } from '../integrations/neo4j/connection';
import { createCompanyNode, createRelationship, applyConstraints } from '../integrations/neo4j/graphService';

const BANNER = `
╔══════════════════════════════════════════════════════════════╗
║   SEED DATA — FOR TESTING ONLY. NOT REAL COMPANIES.         ║
║   All company names, registration numbers and details are   ║
║   entirely fictional and for development purposes only.     ║
╚══════════════════════════════════════════════════════════════╝
`;

interface SeedCompany {
  companyName: string;
  registrationNumber: string;
  website: string;
  description: string;
  industry: 'Technology' | 'FinTech' | 'HealthTech' | 'EdTech' | 'E-Commerce' | 'Logistics' | 'Manufacturing' | 'Telecommunications' | 'Media' | 'Retail' | 'Energy' | 'Real Estate' | 'Other';
  country: string;
  headquarters: string;
  foundedDate: Date;
  employeeCount: number;
  companyStage: 'Pre-Seed' | 'Seed' | 'Series A' | 'Series B' | 'Series C' | 'Series D+' | 'Public' | 'Established';
  signal: {
    signalType: 'FUNDING_ROUND' | 'HIRING_SURGE' | 'TECH_ADOPTION' | 'PARTNERSHIP' | 'EXPANSION' | 'PRODUCT_LAUNCH' | 'LEADERSHIP_CHANGE' | 'REGULATORY' | 'OTHER';
    description: string;
    source: string;
    confidenceScore: number;
  };
  opportunity: {
    opportunityType: string;
    potentialService: string;
    reasoning: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    confidenceScore: number;
  };
}

const seedCompanies: SeedCompany[] = [
  {
    companyName: 'QuantumLeap Technologies Pte Ltd',
    registrationNumber: 'SG-FAKE-202301001',
    website: 'https://quantumleap-fictional.example.com',
    description: 'A fictional AI-powered supply chain optimisation platform serving Southeast Asian manufacturers.',
    industry: 'Technology',
    country: 'Singapore',
    headquarters: 'One North, Singapore',
    foundedDate: new Date('2021-03-15'),
    employeeCount: 120,
    companyStage: 'Series B',
    signal: {
      signalType: 'FUNDING_ROUND',
      description: 'FICTIONAL: QuantumLeap raised SGD 25M Series B to expand into Vietnam and Thailand.',
      source: 'TechCrunch APAC (Fictional)',
      confidenceScore: 0.9,
    },
    opportunity: {
      opportunityType: 'Cloud Connectivity',
      potentialService: 'Singtel SD-WAN + Multi-Cloud Connect',
      reasoning: 'Rapid regional expansion creates need for secure, low-latency cross-border connectivity. SD-WAN would unify their Vietnam, Thailand and SG offices.',
      priority: 'HIGH',
      confidenceScore: 0.88,
    },
  },
  {
    companyName: 'Nova Health Solutions Sdn Bhd',
    registrationNumber: 'MY-FAKE-202202789',
    website: 'https://novahealth-fictional.example.com',
    description: 'A fictional Malaysian telemedicine and digital health records platform serving rural communities.',
    industry: 'HealthTech',
    country: 'Malaysia',
    headquarters: 'Cyberjaya, Malaysia',
    foundedDate: new Date('2020-07-01'),
    employeeCount: 85,
    companyStage: 'Series A',
    signal: {
      signalType: 'HIRING_SURGE',
      description: 'FICTIONAL: Nova Health posted 40+ engineering roles in Q1, signalling major product expansion.',
      source: 'LinkedIn Insights (Fictional)',
      confidenceScore: 0.75,
    },
    opportunity: {
      opportunityType: 'IoT Connectivity',
      potentialService: 'Singtel IoT SIM + Smart Health Device Connectivity',
      reasoning: 'Telemedicine devices in rural clinics need reliable, low-cost IoT connectivity. Singtel IoT SIMs with built-in Malaysia coverage are a strong fit.',
      priority: 'HIGH',
      confidenceScore: 0.82,
    },
  },
  {
    companyName: 'Baht Street FinTech Co Ltd',
    registrationNumber: 'TH-FAKE-654321',
    website: 'https://bahtstreet-fictional.example.com',
    description: 'A fictional Thai B2B payments and cross-border remittance startup targeting SMEs.',
    industry: 'FinTech',
    country: 'Thailand',
    headquarters: 'Silom, Bangkok, Thailand',
    foundedDate: new Date('2019-11-20'),
    employeeCount: 60,
    companyStage: 'Series A',
    signal: {
      signalType: 'PARTNERSHIP',
      description: 'FICTIONAL: Baht Street partnered with a fictional Thai bank to offer instant payroll disbursement.',
      source: 'Bangkok Post (Fictional)',
      confidenceScore: 0.80,
    },
    opportunity: {
      opportunityType: 'Cybersecurity',
      potentialService: 'Singtel Managed Security Services (MSSP)',
      reasoning: 'Processing cross-border payments demands PCI-DSS compliance and 24/7 threat monitoring — a strong MSSP upsell given their recent banking partnership.',
      priority: 'MEDIUM',
      confidenceScore: 0.70,
    },
  },
  {
    companyName: 'Archipelago EduTech Inc',
    registrationNumber: 'ID-FAKE-789012',
    website: 'https://archipelago-edu-fictional.example.com',
    description: 'A fictional Indonesian online learning platform focused on vocational training across 500+ islands.',
    industry: 'EdTech',
    country: 'Indonesia',
    headquarters: 'Sudirman, Jakarta, Indonesia',
    foundedDate: new Date('2018-04-10'),
    employeeCount: 200,
    companyStage: 'Series C',
    signal: {
      signalType: 'PRODUCT_LAUNCH',
      description: 'FICTIONAL: Archipelago launched offline-sync LMS modules to serve low-bandwidth regions.',
      source: 'Techinasia (Fictional)',
      confidenceScore: 0.85,
    },
    opportunity: {
      opportunityType: 'CDN & Streaming',
      potentialService: 'Singtel Video CDN + Regional Edge Caching',
      reasoning: 'Serving video content across 17,000+ Indonesian islands requires edge caching infrastructure. Singtel\'s APAC CDN footprint directly addresses their latency challenges.',
      priority: 'HIGH',
      confidenceScore: 0.91,
    },
  },
  {
    companyName: 'GreenWatt Energy Pte Ltd',
    registrationNumber: 'SG-FAKE-202003456',
    website: 'https://greenwatt-fictional.example.com',
    description: 'A fictional Singapore-headquartered renewable energy marketplace connecting solar producers with commercial buyers across ASEAN.',
    industry: 'Energy',
    country: 'Singapore',
    headquarters: 'Jurong Innovation District, Singapore',
    foundedDate: new Date('2020-01-05'),
    employeeCount: 45,
    companyStage: 'Seed',
    signal: {
      signalType: 'EXPANSION',
      description: 'FICTIONAL: GreenWatt received approval to operate its energy marketplace in the Philippines.',
      source: 'Energy Monitor APAC (Fictional)',
      confidenceScore: 0.72,
    },
    opportunity: {
      opportunityType: 'Smart Grid Connectivity',
      potentialService: 'Singtel NB-IoT for Smart Meter Integration',
      reasoning: 'Energy marketplace participants need real-time smart meter data. NB-IoT provides low-power, wide-area coverage ideal for distributed solar installations across ASEAN.',
      priority: 'MEDIUM',
      confidenceScore: 0.68,
    },
  },
];

const datasetTag = 'fictional-apac-seed-v1';
function fixtureId(registrationNumber: string, kind: string) {
  return createHash('sha256').update([datasetTag, registrationNumber, kind].join(':')).digest('hex').slice(0, 24);
}

export async function seed(): Promise<void> {
  console.log(BANNER);
  logger.info('Starting seed process...');

  await connectMongoDB();
  await connectNeo4j();
  await applyConstraints();

  const companyIds = new Map<string, string>();
  for (const { signal, opportunity, ...data } of seedCompanies) {
    // Earlier versions generated IDs on insertion. Reuse their records and graph links.
    const companyId = fixtureId(data.registrationNumber, 'company');
    const company = await Company.findOneAndUpdate({ $or: [
      { _id: companyId }, { registrationNumber: data.registrationNumber, 'sourceReferences.sourceUrl': 'internal://seed' },
    ] }, {
      $set: { datasetTag, isSynthetic: true },
      $setOnInsert: { ...data, _id: companyId,
        sourceReferences: [{ sourceName: 'Seed Script', sourceUrl: 'internal://seed', fetchedAt: new Date() }] },
    }, { upsert: true, new: true });
    companyIds.set(data.companyName, company.id);

    // 2. Create Neo4j node
    try {
      await createCompanyNode({
        companyId:    company.id as string,
        companyName:  company.companyName,
        country:      company.country,
        industry:     company.industry,
        companyStage: company.companyStage,
        website:      company.website,
        description:  company.description,
        employeeCount: company.employeeCount,
      });

      // Update MongoDB doc with Neo4j node reference
      await Company.findByIdAndUpdate(company.id, { neo4jNodeId: company.id });
      logger.info(`Created Neo4j node for: ${company.companyName}`);
    } catch (err) {
      logger.warn(`Neo4j node creation failed for ${company.companyName} — skipping`, {
        error: (err as Error).message,
      });
    }

    // 3. Intelligence signal
    const signalId = fixtureId(data.registrationNumber, 'signal');
    await IntelligenceSignal.updateOne({ companyId: company._id, $or: [
      { _id: signalId }, { source: signal.source, description: signal.description },
    ] }, {
      $set: { datasetTag, isSynthetic: true },
      $setOnInsert: { ...signal, _id: signalId, detectedAt: new Date() },
    }, { upsert: true });

    // 4. Opportunity
    const opportunityId = fixtureId(data.registrationNumber, 'opportunity');
    await Opportunity.updateOne({ companyId: company._id, $or: [
      { _id: opportunityId }, { opportunityType: opportunity.opportunityType, reasoning: opportunity.reasoning },
    ] }, {
      $set: { datasetTag, isSynthetic: true },
      $setOnInsert: { ...opportunity, _id: opportunityId, status: 'OPEN' },
    }, { upsert: true });
  }

  // Create a sample PARTNERS_WITH relationship between the two Singapore companies
  try {
    const sg1 = companyIds.get('QuantumLeap Technologies Pte Ltd');
    const sg2 = companyIds.get('GreenWatt Energy Pte Ltd');

    if (sg1 && sg2) {
      await createRelationship(sg1, sg2, 'PARTNERS_WITH', {
        since: '2024',
        description: 'Fictional partnership for smart factory energy monitoring',
      });
      logger.info('Created PARTNERS_WITH relationship in Neo4j (fictional)');
    }
  } catch (err) {
    logger.warn('Could not create sample relationship', { error: (err as Error).message });
  }

  logger.info('Seed complete', { fictionalCompanies: companyIds.size });
}

if (require.main === module) {
  seed().catch((err: Error) => {
    logger.error('Seed failed', { error: err.message, stack: err.stack });
    process.exitCode = 1;
  }).finally(closeDatabases);
}
