const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Case = require('../models/Case');
const CaseTransferRequest = require('../models/CaseTransferRequest');

const REQUESTS_PER_INSPECTOR = 2;
const STATUS_OPTIONS = ['PENDING', 'APPROVED', 'REJECTED'];

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

const buildReason = (caseItem, index) =>
  `Requesting transfer for ${caseItem.case_title} due to workload balancing (request #${index + 1}).`;

const run = async () => {
  try {
    await connectMongo();
    const inspectors = await User.find({ role: 'inspector' }).lean();
    if (!inspectors.length) {
      console.warn('[WARN] No inspectors found. Seed users first.');
      return;
    }

    const requests = [];
    let index = 0;

    const commissioner = await User.findOne({ role: 'commissioner' }).lean();

    for (const inspector of inspectors) {
      const inspectorCases = await Case.find({
        $or: [{ case_handler: inspector.fullname }, { assigned_inspector_id: inspector._id }],
        is_removed: false,
      })
        .sort({ case_date: -1 })
        .limit(REQUESTS_PER_INSPECTOR)
        .lean();

      for (let i = 0; i < REQUESTS_PER_INSPECTOR; i += 1) {
        const caseItem = inspectorCases[i];
        if (!caseItem) {
          index += 1;
          continue;
        }

        const status = STATUS_OPTIONS[index % STATUS_OPTIONS.length];
        const createdAt = new Date(Date.now() - index * 2 * 60 * 60 * 1000);

        // For APPROVED requests, pick a different inspector as the target
        let toInspectorId = null;
        let toInspectorName = '';
        if (status === 'APPROVED') {
          const otherInspector = inspectors.find(
            (ins) => String(ins._id) !== String(inspector._id)
          );
          if (otherInspector) {
            toInspectorId = otherInspector._id;
            toInspectorName = otherInspector.fullname;
          }
        }

        requests.push({
          case_id: caseItem._id,
          case_title: caseItem.case_title,
          case_type: caseItem.case_type || '',
          case_status: caseItem.status || '',
          case_date: caseItem.case_date || null,
          from_inspector_id: inspector._id,
          from_inspector_name: inspector.fullname,
          reason: buildReason(caseItem, index),
          status,
          to_inspector_id: toInspectorId,
          to_inspector_name: toInspectorName,
          resolved_by_id: status !== 'PENDING' && commissioner ? commissioner._id : null,
          resolved_by_name: status !== 'PENDING' && commissioner ? commissioner.fullname : '',
          resolved_at: status === 'PENDING' ? null : createdAt,
          createdAt,
          updatedAt: createdAt,
        });

        index += 1;
      }
    }

    if (preview) {
      console.log(`[PREVIEW] Transfer requests to create: ${requests.length}`);
      console.log(requests.slice(0, 3));
      return;
    }

    if (reset) {
      await CaseTransferRequest.deleteMany();
      console.log('[OK] Existing transfer requests deleted.');
    }

    if (!requests.length) {
      console.warn('[WARN] No transfer requests to insert.');
      return;
    }

    await CaseTransferRequest.insertMany(requests, { ordered: true });
    console.log(`[OK] Inserted ${requests.length} transfer requests.`);
  } catch (err) {
    console.error('[ERROR] Transfer request seed failed:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
};

run();
