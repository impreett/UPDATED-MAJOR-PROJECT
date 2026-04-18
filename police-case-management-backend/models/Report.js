const mongoose = require('mongoose');

/* Report model schema definition */
const reportSchema = new mongoose.Schema({
    email: { type: String, required: true },       /* Email address of the person submitting the report */
    reportText: { type: String, required: true },  /* Content of the submitted report */
    date: { type: Date, default: Date.now }        /* Timestamp when the report was submitted */
});

reportSchema.index({ date: -1 });

const Report = mongoose.model('Report', reportSchema);
module.exports = Report;
