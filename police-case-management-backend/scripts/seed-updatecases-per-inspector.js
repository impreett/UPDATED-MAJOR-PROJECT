const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Case = require('../models/Case');
const UpdateCase = require('../models/UpdateCase');

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

const buildUpdateForCase = (caseItem, index) => {
  const updatedTitle = `${caseItem.case_title} (Update Request)`;
  const updatedDescription = `${caseItem.case_description || ''}`.trim();
  const descriptionSuffix = updatedDescription ? ' Inspector requested additional details.' : 'Inspector requested additional details.';

  return {
    originalCaseId: caseItem._id,
    case_title: updatedTitle,
    case_type: caseItem.case_type,
    case_description: `${updatedDescription}${descriptionSuffix}`.trim(),
    changes_done: [
      'Requested description update',
      index % 2 === 0 ? 'Clarified suspects' : 'Added victim notes',
    ],
    suspects: caseItem.suspects || [],
    victim: caseItem.victim || [],
    guilty_name: caseItem.guilty_name || [],
    evidence: caseItem.evidence || [],
    case_date: caseItem.case_date,
    case_handler: caseItem.case_handler,
    status: caseItem.status,
    requestedAt: new Date(Date.now() - index * 2 * 60 * 60 * 1000),
  };
};

const run = async () => {
  try {
    await connectMongo();
    const inspectors = await User.find({ role: 'inspector' }).lean();
    if (!inspectors.length) {
      console.warn('[WARN] No inspectors found. Seed users first.');
      return;
    }

    const updates = [];
    let skipped = 0;

    for (let i = 0; i < inspectors.length; i += 1) {
      const inspector = inspectors[i];
      const caseItem =
        (await Case.findOne({ case_handler: inspector.fullname, is_removed: false })
          .sort({ case_date: -1 })
          .lean()) ||
        (await Case.findOne({ assigned_inspector_id: inspector._id, is_removed: false })
          .sort({ case_date: -1 })
          .lean());

      if (!caseItem) {
        skipped += 1;
        continue;
      }

      updates.push(buildUpdateForCase(caseItem, i));
    }

    if (preview) {
      console.log(`[PREVIEW] Update cases to create: ${updates.length}. Skipped: ${skipped}`);
      console.log(updates.slice(0, 3));
      return;
    }

    if (reset) {
      await UpdateCase.deleteMany();
      console.log('[OK] Existing update cases deleted.');
    }

    if (!updates.length) {
      console.warn('[WARN] No update cases to insert.');
      return;
    }

    await UpdateCase.insertMany(updates, { ordered: true });
    console.log(`[OK] Inserted ${updates.length} update cases. Skipped: ${skipped}`);
  } catch (err) {
    console.error('[ERROR] Update case seed failed:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
};

run();
