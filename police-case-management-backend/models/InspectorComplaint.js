const mongoose = require('mongoose');

const inspectorComplaintSchema = new mongoose.Schema(
    {
        citizen_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        citizen_name: { type: String, required: true, trim: true },
        inspector_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        inspector_name: { type: String, required: true, trim: true },
        inspector_police_id: { type: String, required: true, trim: true },
        inspector_city: { type: String, required: true, trim: true },
        reason: { type: String, required: true, trim: true, minlength: 10 },
        evidence: [
            {
                evidence_name: { type: String, trim: true, default: '' },
                evidence_file_url: { type: String, trim: true, default: '' },
                evidence_file_type: { type: String, trim: true, default: '' },
            },
        ],
        evidence_name: { type: String, trim: true, default: '' },
        evidence_file_url: { type: String, trim: true, default: '' },
        evidence_file_type: { type: String, trim: true, default: '' },
        status: {
            type: String,
            enum: ['NEW', 'WORKING', 'DONE', 'REJECTED', 'FAKE'],
            default: 'NEW',
            index: true,
        },
        commissioner_note: { type: String, default: '', trim: true },
    },
    { timestamps: true }
);

inspectorComplaintSchema.index({ status: 1, createdAt: -1 });
inspectorComplaintSchema.index({ citizen_id: 1, createdAt: -1 });

const InspectorComplaint = mongoose.model('InspectorComplaint', inspectorComplaintSchema);
module.exports = InspectorComplaint;
