const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const Case = require('../models/Case');
const UpdateCase = require('../models/UpdateCase');
const InspectorComplaint = require('../models/InspectorComplaint');
const Fine = require('../models/Fine');

const args = new Set(process.argv.slice(2));
const preview = args.has('--preview');
const sourceArg = [...args].find((arg) => arg.startsWith('--source='));

const SOURCE_DIR = sourceArg ? sourceArg.split('=')[1] : path.join(__dirname, '..', '..', 'photo');
const DEST_DIR = path.join(__dirname, '..', 'uploads', 'evidence');

const EXT_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

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

const sanitizeBase = (value) =>
  value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const loadEvidenceFiles = () => {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`Source directory not found: ${SOURCE_DIR}`);
  }

  const entries = fs.readdirSync(SOURCE_DIR);
  const files = entries
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return Boolean(EXT_MIME[ext]);
    })
    .map((file, index) => {
      const ext = path.extname(file).toLowerCase();
      const base = sanitizeBase(path.basename(file, ext)) || `evidence-${index + 1}`;
      const target = `seed-evidence-${String(index + 1).padStart(3, '0')}-${base}${ext}`;
      return {
        sourcePath: path.join(SOURCE_DIR, file),
        targetFile: target,
        mime: EXT_MIME[ext],
        name: base.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || `Evidence ${index + 1}`,
      };
    });

  if (!files.length) {
    throw new Error('No valid image/video files found in source directory.');
  }

  return files;
};

const ensureEvidenceCopies = (files) => {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  for (const file of files) {
    const destPath = path.join(DEST_DIR, file.targetFile);
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(file.sourcePath, destPath);
    }
  }
};

const buildEvidenceSet = (files, index) => {
  const count = files.length > 1 ? (index % 2) + 1 : 1;
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const file = files[(index + i) % files.length];
    list.push({
      evidence_name: file.name || `Evidence ${index + i + 1}`,
      evidence_file_url: `/uploads/evidence/${file.targetFile}`,
      evidence_file_type: file.mime,
    });
  }
  return list;
};

const updateCollection = async (Model, buildUpdate) => {
  const docs = await Model.find({}, '_id').lean();
  if (!docs.length) return { updated: 0 };
  const ops = docs.map((doc, index) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: buildUpdate(index),
    },
  }));

  if (preview) {
    return { updated: ops.length };
  }

  const result = await Model.bulkWrite(ops, { ordered: false });
  return { updated: result.modifiedCount || ops.length };
};

const run = async () => {
  try {
    const files = loadEvidenceFiles();
    ensureEvidenceCopies(files);
    await connectMongo();

    const caseResult = await updateCollection(Case, (index) => ({
      $set: { evidence: buildEvidenceSet(files, index) },
    }));

    const updateCaseResult = await updateCollection(UpdateCase, (index) => ({
      $set: { evidence: buildEvidenceSet(files, index) },
    }));

    const complaintResult = await updateCollection(InspectorComplaint, (index) => {
      const evidence = buildEvidenceSet(files, index);
      return {
        $set: {
          evidence,
          evidence_name: evidence[0]?.evidence_name || '',
          evidence_file_url: evidence[0]?.evidence_file_url || '',
          evidence_file_type: evidence[0]?.evidence_file_type || '',
        },
      };
    });

    const fineResult = await updateCollection(Fine, (index) => ({
      $set: { evidence: buildEvidenceSet(files, index) },
    }));

    if (preview) {
      console.log('[PREVIEW] Evidence will be attached as follows:');
      console.log(`Cases: ${caseResult.updated}`);
      console.log(`UpdateCases: ${updateCaseResult.updated}`);
      console.log(`InspectorComplaints: ${complaintResult.updated}`);
      console.log(`Fines: ${fineResult.updated}`);
      return;
    }

    console.log('[OK] Evidence attached.');
    console.log(`Cases updated: ${caseResult.updated}`);
    console.log(`UpdateCases updated: ${updateCaseResult.updated}`);
    console.log(`InspectorComplaints updated: ${complaintResult.updated}`);
    console.log(`Fines updated: ${fineResult.updated}`);
  } catch (err) {
    console.error('[ERROR] Evidence attachment failed:', err.message || err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
};

run();
