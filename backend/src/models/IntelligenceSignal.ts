import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export const SignalTypeEnum = [
  'FUNDING_ROUND',
  'HIRING_SURGE',
  'TECH_ADOPTION',
  'PARTNERSHIP',
  'EXPANSION',
  'PRODUCT_LAUNCH',
  'LEADERSHIP_CHANGE',
  'REGULATORY',
  'OTHER',
] as const;

export type SignalType = (typeof SignalTypeEnum)[number];

export interface IIntelligenceSignal {
  companyId: Types.ObjectId;
  signalType: SignalType;
  description: string;
  source: string;
  sourceUrl?: string;
  detectedAt: Date;
  confidenceScore: number; // 0–1
  createdAt: Date;
  updatedAt: Date;
}

export interface IIntelligenceSignalDocument extends IIntelligenceSignal, Document {}

const IntelligenceSignalSchema = new Schema<IIntelligenceSignalDocument>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    signalType: {
      type: String,
      enum: SignalTypeEnum,
      required: true,
    },
    description: { type: String, required: true, trim: true },
    source:      { type: String, required: true, trim: true },
    sourceUrl:   { type: String, trim: true },
    detectedAt:  { type: Date, required: true, default: Date.now },
    confidenceScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
  },
  {
    timestamps: true,
    collection: 'intelligence_signals',
  }
);

export const IntelligenceSignal: Model<IIntelligenceSignalDocument> =
  mongoose.model<IIntelligenceSignalDocument>('IntelligenceSignal', IntelligenceSignalSchema);
