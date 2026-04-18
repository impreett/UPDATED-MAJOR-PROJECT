const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Fine = require('../models/Fine');

const FINES_PER_CITIZEN = 5;
const REASONS = [
  'Speeding in a residential area',
  'Signal jump at a major intersection',
  'Illegal parking in a no-parking zone',
  'Using mobile phone while driving',
  'Wrong-side driving on a one-way road',
  'Riding without helmet in restricted zone',
  'Driving without valid insurance proof',
  'Failure to stop at pedestrian crossing',
  'Over-speeding in a school zone',
  'Reckless driving reported by patrol unit',
];

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

const pick = (list, idx) => list[idx % list.length];

const run = async () => {
  try {
    await connectMongo();
    const citizens = await User.find({ role: 'citizen' }).lean();
    const inspectors = await User.find({ role: 'inspector' }).lean();
    const commissioners = await User.find({ role: 'commissioner' }).lean();

    const issuers = [...inspectors, ...commissioners];
    if (!citizens.length || !issuers.length) {
      console.warn('[WARN] Need citizens and inspectors/commissioners. Seed users first.');
      return;
    }

    const fines = [];
    let index = 0;

    for (const citizen of citizens) {
      for (let i = 0; i < FINES_PER_CITIZEN; i += 1) {
        const issuer = issuers[index % issuers.length];
        const reason = pick(REASONS, index);
        const status = index % 4 === 0 ? 'PAID' : 'UNPAID';
        const createdAt = new Date(Date.now() - index * 4 * 60 * 60 * 1000);

        fines.push({
          person_name: citizen.fullname,
          person_age: citizen.age || 25,
          mobile_number: citizen.contact,
          aadhar_number: citizen.aadhar_number || String(400000000000 + index),
          email: citizen.email,
          amount: 200 + (index % 15) * 50,
          reason,
          status,
          issued_by: issuer._id,
          issued_by_name: issuer.fullname,
          citizen_id: citizen._id,
          evidence: [],
          payment_gateway: status === 'PAID' ? 'razorpay' : '',
          razorpay_order_id: '',
          razorpay_payment_id: status === 'PAID' ? `pay_${String(index).padStart(6, '0')}` : '',
          razorpay_signature: '',
          paid_at: status === 'PAID' ? createdAt : null,
          createdAt,
          updatedAt: createdAt,
        });

        index += 1;
      }
    }

    if (preview) {
      console.log(`[PREVIEW] Fines to create: ${fines.length}`);
      console.log(fines.slice(0, 3));
      return;
    }

    if (reset) {
      await Fine.deleteMany();
      console.log('[OK] Existing fines deleted.');
    }

    await Fine.insertMany(fines, { ordered: true });
    console.log(`[OK] Inserted ${fines.length} fines.`);
  } catch (err) {
    console.error('[ERROR] Fine seed failed:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
};

run();
