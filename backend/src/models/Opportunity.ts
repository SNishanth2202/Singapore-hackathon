import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export const OpportunityPriorityEnum = ['HIGH', 'MEDIUM', 'LOW'] as const;
export const OpportunityStatusEnum   = ['OPEN', 'IN_PROGRESS', 'CLOSED'] as const;

export type OpportunityPriority = (typeof OpportunityPriorityEnum)[number];
export type OpportunityStatus   = (typeof OpportunityStatusEnum)[number];

export interface IOpportunity {
  companyId: Types.ObjectId;
  opportunityType: string;
  potentialService: string;
  reasoning: string;
  priority: OpportunityPriority;
  confidenceScore: number; // 0–1
  status: OpportunityStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOpportunityDocument extends IOpportunity, Document {}

const OpportunitySchema = new Schema<IOpportunityDocument>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    opportunityType:  { type: String, required: true, trim: true },
    potentialService: { type: String, required: true, trim: true },
    reasoning:        { type: String, required: true, trim: true },
    priority: {
      type: String,
      enum: OpportunityPriorityEnum,
      required: true,
      default: 'MEDIUM',
    },
    confidenceScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    status: {
      type: String,
      enum: OpportunityStatusEnum,
      required: true,
      default: 'OPEN',
    },
  },
  {
    timestamps: true,
    collection: 'opportunities',
  }
);

// Indexes for common filter patterns
OpportunitySchema.index({ status: 1, priority: 1 });
OpportunitySchema.index({ companyId: 1, status: 1 });

export const Opportunity: Model<IOpportunityDocument> = mongoose.model<IOpportunityDocument>(
  'Opportunity',
  OpportunitySchema
);
