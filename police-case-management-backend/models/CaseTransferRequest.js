const mongoose = require('mongoose');

const caseTransferRequestSchema = new mongoose.Schema(
    {
        case_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true, index: true },
        case_title: { type: String, required: true, trim: true },
        case_type: { type: String, default: '', trim: true },
        case_status: { type: String, default: '', trim: true },
        case_date: { type: Date, default: null },
        from_inspector_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        from_inspector_name: { type: String, required: true, trim: true },
        reason: { type: String, required: true, trim: true, minlength: 5 },
        status: {
            type: String,
            enum: ['PENDING', 'APPROVED', 'REJECTED'],
            default: 'PENDING',
            index: true,
        },
        to_inspector_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        to_inspector_name: { type: String, default: '', trim: true },
        resolved_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        resolved_by_name: { type: String, default: '', trim: true },
        resolved_at: { type: Date, default: null },
    },
    { timestamps: true }
);

caseTransferRequestSchema.index({ case_id: 1, status: 1 });
caseTransferRequestSchema.index({ from_inspector_id: 1, createdAt: -1 });

const CaseTransferRequest = mongoose.model('CaseTransferRequest', caseTransferRequestSchema);
module.exports = CaseTransferRequest;
