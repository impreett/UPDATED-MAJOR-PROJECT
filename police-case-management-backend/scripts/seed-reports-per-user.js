const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Report = require('../models/Report');

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

const buildReportText = (user, index) => {
  const role = user.role === 'inspector' ? 'inspector' : 'citizen';
  return `Report submitted by ${user.fullname} (${role}) regarding case follow-up #${index + 1}.`;
};

const run = async () => {
  try {
    await connectMongo();
    const users = await User.find({ role: { $in: ['inspector', 'citizen'] } }).lean();
    if (!users.length) {
      console.warn('[WARN] No inspectors or citizens found. Seed users first.');
      return;
    }

    const reports = users.map((user, index) => ({
      email: user.email,
      reportText: buildReportText(user, index),
      date: new Date(Date.now() - index * 6 * 60 * 60 * 1000),
    }));

    if (preview) {
      console.log(`[PREVIEW] Reports to create: ${reports.length}`);
      console.log(reports.slice(0, 3));
      return;
    }

    if (reset) {
      await Report.deleteMany();
      console.log('[OK] Existing reports deleted.');
    }

    await Report.insertMany(reports, { ordered: true });
    console.log(`[OK] Inserted ${reports.length} reports.`);
  } catch (err) {
    console.error('[ERROR] Report seed failed:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
};

run();
