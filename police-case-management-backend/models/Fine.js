const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema(
    {
        evidence_name: { type: String, trim: true, default: '' },
        evidence_file_url: { type: String, trim: true, default: '' },
        evidence_file_type: { type: String, trim: true, default: '' },
    },
    { _id: false }
);

const fineSchema = new mongoose.Schema(
    {
        person_name: { type: String, required: true, trim: true },
        person_age: { type: Number, required: true, min: 18, max: 110 },
        mobile_number: { type: String, required: true, trim: true },
        aadhar_number: { type: String, required: true, trim: true, index: true },
        email: { type: String, required: true, trim: true, lowercase: true },
        amount: { type: Number, required: true, min: 1 },
        reason: { type: String, required: true, trim: true, minlength: 5 },
        status: { type: String, enum: ['UNPAID', 'PAID'], default: 'UNPAID', index: true },
        issued_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        issued_by_name: { type: String, required: true, trim: true },
        citizen_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        evidence: { type: [evidenceSchema], default: [] },
        payment_gateway: { type: String, trim: true, default: '' },
        razorpay_order_id: { type: String, trim: true, default: '' },
        razorpay_payment_id: { type: String, trim: true, default: '' },
        razorpay_signature: { type: String, trim: true, default: '' },
        paid_at: { type: Date, default: null },
    },
    { timestamps: true }
);

fineSchema.index({ aadhar_number: 1, createdAt: -1 });
fineSchema.index({ citizen_id: 1, createdAt: -1 });

const Fine = mongoose.model('Fine', fineSchema);
module.exports = Fine;
