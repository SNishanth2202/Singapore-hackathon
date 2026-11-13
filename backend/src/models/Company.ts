import mongoose, { Document, Schema, Model } from 'mongoose';

export const IndustryEnum = [
  'Technology',
  'FinTech',
  'HealthTech',
  'EdTech',
  'E-Commerce',
  'Logistics',
  'Manufacturing',
  'Telecommunications',
  'Media',
  'Retail',
  'Energy',
  'Real Estate',
  'Other',
] as const;

export const CompanyStageEnum = [
  'Pre-Seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Series D+',
  'Public',
  'Established',
] as const;

export type Industry = (typeof IndustryEnum)[number];
export type CompanyStage = (typeof CompanyStageEnum)[number];

export interface ISourceReference {
  sourceName: string;
  sourceUrl: string;
  fetchedAt: Date;
}

export interface ICompany {
  companyName: string;
  registrationNumber?: string;
  website?: string;
  description?: string;
  industry: Industry;
  country: string;
  headquarters?: string;
  foundedDate?: Date;
  employeeCount?: number;
  companyStage: CompanyStage;
  sourceReferences: ISourceReference[];
  neo4jNodeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICompanyDocument extends ICompany, Document {}

const SourceReferenceSchema = new Schema<ISourceReference>(
  {
    sourceName: { type: String, required: true },
    sourceUrl:  { type: String, required: true },
    fetchedAt:  { type: Date,   required: true, default: Date.now },
  },
  { _id: false }
);

const CompanySchema = new Schema<ICompanyDocument>(
  {
    companyName:        { type: String, required: true, trim: true },
    registrationNumber: { type: String, trim: true },
    website:            { type: String, trim: true },
    description:        { type: String, trim: true },
    industry:           { type: String, enum: IndustryEnum, required: true },
    country:            { type: String, required: true, trim: true },
    headquarters:       { type: String, trim: true },
    foundedDate:        { type: Date },
    employeeCount:      { type: Number, min: 0 },
    companyStage:       { type: String, enum: CompanyStageEnum, required: true },
    sourceReferences:   { type: [SourceReferenceSchema], default: [] },
    neo4jNodeId:        { type: String },
  },
  {
    timestamps: true,
    collection: 'companies',
  }
);

// Indexes for common query patterns
CompanySchema.index({ country: 1, industry: 1, companyStage: 1 });
CompanySchema.index({ companyName: 'text', description: 'text' });
CompanySchema.index({ country: 1 });
CompanySchema.index({ industry: 1 });

export const Company: Model<ICompanyDocument> = mongoose.model<ICompanyDocument>(
  'Company',
  CompanySchema
);
