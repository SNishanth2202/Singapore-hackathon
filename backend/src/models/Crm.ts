import mongoose, { Schema } from 'mongoose';

const common = {
  _id: { type: String, required: true },
  datasetTag: { type: String, required: true, index: true },
  isSynthetic: { type: Boolean, required: true },
};
const accountSchema = new Schema({ ...common, graphAccountId: { type: String, required: true },
  record: { type: Schema.Types.Mixed, required: true }, contentHash: { type: String, required: true } },
{ collection: 'crm_accounts', bufferCommands: false });
const artifactSchema = new Schema({ ...common, accountId: { type: String, required: true, index: true },
  sourceArtifactId: { type: String, required: true }, record: { type: Schema.Types.Mixed, required: true },
  contentHash: { type: String, required: true } }, { collection: 'crm_artifacts', bufferCommands: false });
const extractionSchema = new Schema({ ...common, inputHash: { type: String, required: true },
  record: { type: Schema.Types.Mixed, required: true }, contentHash: { type: String, required: true } },
{ collection: 'crm_extractions', bufferCommands: false });
const datasetSchema = new Schema({ ...common, currentRunId: { type: String, required: true },
  manifestHash: { type: String, required: true } }, { collection: 'crm_datasets', bufferCommands: false });

export const CrmAccount = mongoose.models.CrmAccount ?? mongoose.model('CrmAccount', accountSchema);
export const CrmArtifact = mongoose.models.CrmArtifact ?? mongoose.model('CrmArtifact', artifactSchema);
export const CrmExtraction = mongoose.models.CrmExtraction ?? mongoose.model('CrmExtraction', extractionSchema);
export const CrmDataset = mongoose.models.CrmDataset ?? mongoose.model('CrmDataset', datasetSchema);
