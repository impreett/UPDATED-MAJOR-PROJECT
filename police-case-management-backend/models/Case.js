const mongoose = require('mongoose');

const personSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        age: { type: Number, default: null, min: 0, max: 120 },
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

const caseSchema = new mongoose.Schema(
    {
        case_title: { type: String, required: true, trim: true },
        case_type: { type: String, required: true, trim: true },
        case_description: { type: String, default: '', trim: true },
        changes_done: { type: [String], default: [] },
        suspects: { type: [personSchema], default: [] },
        victim: { type: [personSchema], default: [] },
        guilty_name: { type: [personSchema], default: [] },
        evidence: { type: [evidenceSchema], default: [] },
        case_date: { type: Date, required: true },
        case_handler: { type: String, required: true, trim: true },
        status: { type: String, required: true, enum: ['ACTIVE', 'CLOSE'] },
        isApproved: { type: Boolean, default: false, index: true },
        updated_on: { type: Date, default: null },
        is_removed: { type: Boolean, default: false, index: true },
        withdrawn_by_citizen: { type: Boolean, default: false, index: true },
        withdrawn_at: { type: Date, default: null },
        submitted_by_user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        submitted_by_role: {
            type: String,
            enum: ['commissioner', 'inspector', 'citizen'],
            default: 'inspector',
            index: true,
        },
        assigned_inspector_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        citizen_review_by_inspector_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true,
        },
        citizen_review_by_inspector_name: { type: String, default: '', trim: true },
        citizen_review_status: {
            type: String,
            enum: [
                'INSPECTOR_REVIEW',
                'INSPECTOR_ACCEPTED',
                'FAKE',
                'COMMISSIONER_REVIEW',
                'COMMISSIONER_APPROVED',
                'COMMISSIONER_REJECTED',
            ],
            default: undefined,
            index: true,
        },
    },
    { timestamps: true }
);

caseSchema.index({ isApproved: 1, is_removed: 1, case_date: -1 });
caseSchema.index({ case_handler: 1, isApproved: 1, is_removed: 1, case_date: -1 });
caseSchema.index({ status: 1, isApproved: 1, is_removed: 1, case_date: -1 });
caseSchema.index({ submitted_by_user: 1, submitted_by_role: 1, is_removed: 1, createdAt: -1 });
caseSchema.index({ assigned_inspector_id: 1, citizen_review_status: 1, is_removed: 1, createdAt: -1 });
caseSchema.index({ submitted_by_role: 1, citizen_review_status: 1, isApproved: 1, is_removed: 1, case_date: -1 });

const Case = mongoose.model('Case', caseSchema);
module.exports = Case;
