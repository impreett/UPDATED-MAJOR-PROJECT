const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const InspectorComplaint = require('../models/InspectorComplaint');

const COMPLAINTS_PER_CITIZEN = 5;
const STATUS_OPTIONS = ['NEW', 'WORKING', 'DONE', 'REJECTED', 'FAKE'];

const args = new Set(process.argv.slice(2));
const reset = args.has('--reset');
const preview = args.has('--preview');

const isProduction = process.env.NODE_ENV === 'production';
const LOCAL_MONGO_URI = process.env.LOCAL_MONGO_URI || 'mongodb://127.0.0.1:27017/';
const PROD_MONGO_URI = process.env.PROD_MONGO_URI || '';
const MONGO_DB = process.env.MONGO_DB || 'police_information';
const EXPLICIT_MONGO_URI = process.env.MONGO_URI || process.env.CONNECTION_STRING;

const mongoCandidates = Array.from(
  new Set(
    [
      EXPLICIT_MONGO_URI,
      ...(isProduction ? [PROD_MONGO_URI, LOCAL_MONGO_URI] : [LOCAL_MONGO_URI, PROD_MONGO_URI]),
    ].filter(Boolean)
  )
);

const maskMongoUri = (uri) => uri.replace(/\/\/([^@]+)@/, '//***:***@');

const connectMongo = async () => {
  let lastError = null;
  for (const uri of mongoCandidates) {
    try {
      await mongoose.connect(uri, { dbName: MONGO_DB });
      console.log(`MongoDB connected to database: ${mongoose.connection.name}`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`MongoDB connection failed for ${maskMongoUri(uri)}: ${error.message}`);
    }
  }
  throw lastError || new Error('MongoDB connection failed');
};

const buildReason = (citizen, inspector, index) =>
  `Complaint #${index + 1} by ${citizen.fullname} about inspector ${inspector.fullname} for delayed response and follow-up.`;

const run = async () => {
  try {
    await connectMongo();
    const citizens = await User.find({ role: 'citizen' }).lean();
    const inspectors = await User.find({ role: 'inspector' }).lean();

    if (!citizens.length || !inspectors.length) {
      console.warn('[WARN] Need both citizens and inspectors. Seed users first.');
      return;
    }

    const complaints = [];
    let index = 0;

    for (const citizen of citizens) {
      for (let i = 0; i < COMPLAINTS_PER_CITIZEN; i += 1) {
        const inspector = inspectors[index % inspectors.length];
        const status = STATUS_OPTIONS[index % STATUS_OPTIONS.length];
        const createdAt = new Date(Date.now() - index * 3 * 60 * 60 * 1000);

        complaints.push({
          citizen_id: citizen._id,
          citizen_name: citizen.fullname,
          inspector_id: inspector._id,
          inspector_name: inspector.fullname,
          inspector_police_id: inspector.police_id || '',
          inspector_city: inspector.city || '',
          reason: buildReason(citizen, inspector, index),
          evidence: [],
          status,
          commissioner_note:
            status === 'REJECTED' || status === 'FAKE'
              ? 'Reviewed and marked accordingly.'
              : '',
          createdAt,
          updatedAt: createdAt,
        });

        index += 1;
      }
    }

    if (preview) {
      console.log(`[PREVIEW] Complaints to create: ${complaints.length}`);
      console.log(complaints.slice(0, 3));
      return;
    }

    if (reset) {
      await InspectorComplaint.deleteMany();
      console.log('[OK] Existing complaints deleted.');
    }

    await InspectorComplaint.insertMany(complaints, { ordered: true });
    console.log(`[OK] Inserted ${complaints.length} complaints.`);
  } catch (err) {
    console.error('[ERROR] Complaint seed failed:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
};

run();
