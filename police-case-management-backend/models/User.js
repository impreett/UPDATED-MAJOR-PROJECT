const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        first_name: { type: String, default: '' },
        last_name: { type: String, default: '' },
        fullname: { type: String, required: true, trim: true },
        role: {
            type: String,
            enum: ['commissioner', 'inspector', 'citizen'],
            default: 'inspector',
            index: true,
        },
        police_id: {
            type: String,
            trim: true,
            maxlength: 8,
            unique: true,
            sparse: true,
        },
        contact: { type: String, required: true, unique: true, minlength: 10, maxlength: 10 },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        city: { type: String, required: true, trim: true },
        age: { type: Number, default: null, min: 18, max: 110 },
        aadhar_number: {
            type: String,
            trim: true,
            unique: true,
            sparse: true,
        },
        password: { type: String, required: true },
        isEmailVerified: { type: Boolean, default: false, index: true },
        isSuspended: { type: Boolean, default: false, index: true },
        // Legacy flags retained for backward compatibility with existing data/code paths.
        isAdmin: { type: Boolean, default: false, index: true },
        isApproved: { type: Boolean, default: true, index: true },
    },
    { timestamps: true }
);

userSchema.index({ role: 1, isEmailVerified: 1, isSuspended: 1, fullname: 1 });
userSchema.index({ isAdmin: 1, isEmailVerified: 1, isSuspended: 1, fullname: 1 });

userSchema.pre('validate', function normalizeUser(next) {
    if (this.first_name || this.last_name) {
        this.fullname = `${String(this.first_name || '').trim()} ${String(this.last_name || '').trim()}`
            .trim()
            .replace(/\s+/g, ' ');
    } else if (this.fullname) {
        this.fullname = String(this.fullname).trim().replace(/\s+/g, ' ');
    }

    if (this.role === 'commissioner') {
        this.isAdmin = true;
        this.isApproved = true;
    } else {
        this.isAdmin = false;
    }

    if (this.email) {
        this.email = String(this.email).trim().toLowerCase();
    }
    if (this.aadhar_number) {
        this.aadhar_number = String(this.aadhar_number).trim();
    }
    if (this.police_id) {
        this.police_id = String(this.police_id).trim();
    }
    if (!this.aadhar_number) {
        this.aadhar_number = undefined;
    }
    if (!this.police_id) {
        this.police_id = undefined;
    }
    if (this.contact) {
        this.contact = String(this.contact).trim();
    }

    next();
});

const User = mongoose.model('User', userSchema);
module.exports = User;
