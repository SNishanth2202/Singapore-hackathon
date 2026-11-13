import mongoose, { Document, Schema, Model } from 'mongoose';

export const DataSourceStatusEnum = ['ACTIVE', 'INACTIVE', 'ERROR'] as const;
export type DataSourceStatus = (typeof DataSourceStatusEnum)[number];

export interface IDataSource {
  sourceName: string;
  sourceType: string;
  sourceUrl: string;
  lastFetchedAt?: Date;
  status: DataSourceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDataSourceDocument extends IDataSource, Document {}

const DataSourceSchema = new Schema<IDataSourceDocument>(
  {
    sourceName:    { type: String, required: true, trim: true, unique: true },
    sourceType:    { type: String, required: true, trim: true },
    sourceUrl:     { type: String, required: true, trim: true },
    lastFetchedAt: { type: Date },
    status: {
      type: String,
      enum: DataSourceStatusEnum,
      required: true,
      default: 'ACTIVE',
    },
  },
  {
    timestamps: true,
    collection: 'data_sources',
  }
);

export const DataSource: Model<IDataSourceDocument> = mongoose.model<IDataSourceDocument>(
  'DataSource',
  DataSourceSchema
);
