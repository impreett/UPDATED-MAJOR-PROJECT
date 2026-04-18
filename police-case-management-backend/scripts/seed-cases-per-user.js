const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Case = require('../models/Case');

const CASE_TYPES = [
  'Homicide (Murder)',
  'Manslaughter',
  'Rape / Sexual Assault',
  'Kidnapping / Abduction',
  'Aggravated Assault',
  'Simple Assault / Battery',
  'Robbery',
  'Burglary / House Breaking',
  'Theft (Larceny)',
  'Motor Vehicle Theft',
  'Vandalism / Criminal Damage',
  'Extortion / Blackmail',
  'Cybercrime / Hacking',
  'Fraud / Cheating',
  'Forgery / Counterfeiting',
  'Embezzlement / Breach of Trust',
  'Money Laundering',
  'Drug Offense (NDPS)',
  'Smuggling / Contraband',
  'Illegal Weapons',
  'Illegal Gambling',
  'Public Order / Rioting',
  'Domestic Violence',
  'Missing Person Report',
  'Traffic Accident (Non-Fatal)',
];

const REVIEW_STATUSES = [
  'INSPECTOR_REVIEW',
  'FAKE',
  'COMMISSIONER_REVIEW',
  'COMMISSIONER_APPROVED',
  'COMMISSIONER_REJECTED',
];

const DEFAULT_PER_USER = 5;

const args = new Set(process.argv.slice(2));
const reset = args.has('--reset');
const preview = args.has('--preview');
const perUserArg = [...args].find((arg) => arg.startsWith('--per-user='));
const perUser = perUserArg ? Number(perUserArg.split('=')[1]) : DEFAULT_PER_USER;

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

const buildCasesForUsers = (users, inspectors) => {
  const cases = [];
  let globalIndex = 0;

  for (const user of users) {
    for (let i = 0; i < perUser; i += 1) {
      const caseType = pick(CASE_TYPES, globalIndex);
      const caseTitle = `${caseType} Case #${String(globalIndex + 1).padStart(3, '0')}`;
      const caseDate = new Date(Date.now() - globalIndex * 24 * 60 * 60 * 1000);

      const assignedInspector = inspectors.length
        ? inspectors[globalIndex % inspectors.length]
        : null;

      const isCitizen = user.role === 'citizen';
      const handlerName = isCitizen
        ? assignedInspector?.fullname || 'Unassigned'
        : user.fullname;

      const reviewStatus = isCitizen ? pick(REVIEW_STATUSES, globalIndex) : undefined;

      cases.push({
        case_title: caseTitle,
        case_type: caseType,
        case_description: `Auto-generated ${caseType.toLowerCase()} case for ${user.fullname}.`,
        suspects: [
          { name: `Suspect ${globalIndex + 1}`, age: 20 + ((globalIndex + 3) % 40) },
        ],
        victim: [{ name: `Victim ${globalIndex + 1}`, age: 18 + ((globalIndex + 7) % 45) }],
        case_date: caseDate,
        case_handler: handlerName,
        status: globalIndex % 4 === 0 ? 'CLOSE' : 'ACTIVE',
        isApproved: !isCitizen || globalIndex % 2 === 0,
        updated_on: globalIndex % 3 === 0 ? new Date(caseDate.getTime() + 5 * 3600 * 1000) : null,
        submitted_by_user: user._id,
        submitted_by_role: user.role,
        assigned_inspector_id: isCitizen ? assignedInspector?._id || null : user._id,
        citizen_review_by_inspector_id: isCitizen ? assignedInspector?._id || null : null,
        citizen_review_by_inspector_name: isCitizen ? assignedInspector?.fullname || '' : '',
        citizen_review_status: reviewStatus,
      });

      globalIndex += 1;
    }
  }

  return cases;
};

const run = async () => {
  try {
    await connectMongo();
    const inspectors = await User.find({ role: 'inspector' }).lean();
    const citizens = await User.find({ role: 'citizen' }).lean();
    const commissioners = await User.find({ role: 'commissioner' }).lean();

    if (!inspectors.length) {
      console.warn('[WARN] No inspectors found. Assignments will be unassigned.');
    }

    const users = [...inspectors, ...citizens, ...commissioners];
    if (!users.length) {
      console.warn('[WARN] No users found. Seed users before seeding cases.');
      return;
    }

    const cases = buildCasesForUsers(users, inspectors);

    if (preview) {
      console.log(`[PREVIEW] Cases to create: ${cases.length}`);
      console.log(cases.slice(0, 3));
      return;
    }

    if (reset) {
      await Case.deleteMany();
      console.log('[OK] Existing cases deleted.');
    }

    await Case.insertMany(cases, { ordered: true });
    console.log(`[OK] Inserted ${cases.length} cases.`);
  } catch (err) {
    console.error('[ERROR] Case seed failed:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
};

run();
