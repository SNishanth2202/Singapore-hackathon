import mongoose, { Schema } from 'mongoose';
import { Company } from './Company';
import { IntelligenceSignal } from './IntelligenceSignal';
import { Opportunity } from './Opportunity';
import { DataSource } from './DataSource';
import { SalesActivity } from './SalesActivity';
import { AiManagementCompany, AiManagementSettings, AiManagementNotification, DailyRankingRun, AiManagementLease } from './AiManagement';
import { CrmAccount, CrmArtifact, CrmDataset, CrmExtraction } from './Crm';

const options = { timestamps: true, bufferCommands: false } as const;
const researchSchema = new Schema({
  _id: { type: String, required: true }, entityId: { type: String, required: true, index: true },
  record: { type: Schema.Types.Mixed, required: true },
  graphStatus: { type: String, enum: ['PENDING', 'PROCESSING', 'SYNCED'], default: 'PENDING', index: true },
  graphAttempts: { type: Number, default: 0 }, graphRetryAt: { type: Date, default: Date.now },
  graphLeaseUntil: { type: Date, default: () => new Date(0) }, graphSyncedAt: Date,
  graphLeaseToken: String,
}, { ...options, collection: 'research_snapshots' });
researchSchema.index({ graphStatus: 1, graphRetryAt: 1, graphLeaseUntil: 1 });

const profileSchema = new Schema({
  _id: { type: String, required: true }, version: { type: Number, required: true },
  knowledge: { type: Schema.Types.Mixed, required: true },
}, { ...options, collection: 'business_profiles' });
const versionSchema = new Schema({
  _id: { type: Number, required: true }, knowledge: { type: Schema.Types.Mixed, required: true },
}, { ...options, collection: 'business_knowledge_versions' });
const analysisSchema = new Schema({
  _id: { type: String, required: true }, companyId: { type: String, required: true, index: true },
  knowledgeVersion: { type: Number, required: true }, result: { type: Schema.Types.Mixed, required: true },
}, { ...options, collection: 'analysis_runs' });
analysisSchema.index({ companyId: 1, createdAt: -1 });

const companyIdentitySchema = new Schema({
  _id: { type: String, required: true }, identity: { type: Schema.Types.Mixed, required: true },
  latestResearchId: { type: String, required: true }, researchedAt: { type: Date, required: true },
}, { ...options, collection: 'company_profiles' });

export const ResearchSnapshot = mongoose.model('ResearchSnapshot', researchSchema);
export const BusinessProfile = mongoose.model('BusinessProfile', profileSchema);
export const BusinessKnowledgeVersion = mongoose.model('BusinessKnowledgeVersion', versionSchema);
export const AnalysisRun = mongoose.model('AnalysisRun', analysisSchema);
export const CompanyProfile = mongoose.model('CompanyProfile', companyIdentitySchema);

export async function ensureCloudIndexes(): Promise<void> {
  // Add declared indexes without removing any existing indexes or data.
  const models: mongoose.Model<any>[] = [
    ResearchSnapshot, CompanyProfile, BusinessProfile, BusinessKnowledgeVersion, AnalysisRun,
    Company, IntelligenceSignal, Opportunity, DataSource, SalesActivity,
    AiManagementCompany, AiManagementSettings, AiManagementNotification, DailyRankingRun, AiManagementLease,
    CrmAccount, CrmArtifact, CrmDataset, CrmExtraction,
  ];
  for (const model of models) {
    await model.createCollection();
    await model.createIndexes();
  }
}

export function requireCloudMongo(): void {
  if (mongoose.connection.readyState !== 1) {
    const { AppError } = require('../utils/errors');
    throw new AppError('Cloud storage is unavailable. Check the MongoDB Atlas connection.', 503, 'CLOUD_STORAGE_UNAVAILABLE');
  }
}
