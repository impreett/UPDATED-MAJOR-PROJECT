const mongoose = require('mongoose');

const personSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        age: { type: Number, default: null, min: 0, max: 120 }
    },
    { _id: false }
);

const evidenceSchema = new mongoose.Schema(
    {
        evidence_name: { type: String, required: true, trim: true },
        evidence_file_url: { type: String, required: true, trim: true },
        evidence_file_type: { type: String, required: true, trim: true },
    },
    { _id: false }
);

/* Schema for case update requests - stores proposed changes before approval */
const updateCaseSchema = new mongoose.Schema({
    originalCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true },
    case_title: { type: String, required: true },
    case_type: { type: String, required: true },
    case_description: { type: String, default: '' },
    changes_done: { type: [String], default: [] },
    suspects: { type: [personSchema], default: [] },
    victim: { type: [personSchema], default: [] },
    guilty_name: { type: [personSchema], default: [] },
    evidence: { type: [evidenceSchema], default: [] },
    case_date: { type: Date, required: true },
    case_handler: { type: String, required: true },
    status: { type: String, required: true, enum: ['ACTIVE', 'CLOSE'] },
    requestedAt: { type: Date, required: true, default: Date.now }
});

updateCaseSchema.index({ requestedAt: -1 });
updateCaseSchema.index({ originalCaseId: 1, requestedAt: -1 });

const UpdateCase = mongoose.model('UpdateCase', updateCaseSchema);
module.exports = UpdateCase;
