const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');

const CITIES = [
  'Adajan',
  'Vesu',
  'Piplod',
  'City Light',
  'Athwa',
  'Althan',
  'Pal',
  'Jahangirpura',
  'Rander',
  'Katargam',
  'Varachha',
  'Amroli',
  'Udhna',
  'Limbayat',
  'Dindoli',
  'Pandesara',
  'Sachin',
  'Hazira',
];

const INSPECTOR_FIRST = [
  'Aarav',
  'Aditi',
  'Akash',
  'Ananya',
  'Arjun',
  'Bhavesh',
  'Deepa',
  'Dhruv',
  'Farhan',
  'Gaurav',
  'Harsh',
  'Isha',
  'Jatin',
  'Karan',
  'Meera',
  'Nirav',
  'Pooja',
  'Rahul',
  'Rina',
  'Sahil',
  'Tanya',
  'Umang',
  'Varun',
  'Yash',
  'Zoya',
  'Kabir',
  'Mihir',
  'Neha',
  'Rohit',
  'Sneha',
];

const INSPECTOR_LAST = [
  'Mehta',
  'Patel',
  'Shah',
  'Khan',
  'Desai',
  'Rana',
  'Solanki',
  'Trivedi',
  'Vora',
  'Chauhan',
  'Mistry',
  'Parmar',
  'Raval',
  'Joshi',
  'Kapoor',
];

const CITIZEN_FIRST = [
  'Aarya',
  'Ayaan',
  'Dev',
  'Diya',
  'Esha',
  'Ishaan',
  'Kavya',
  'Kiara',
  'Maya',
  'Neel',
  'Nisha',
  'Ojas',
  'Pari',
  'Rhea',
  'Ritvik',
  'Saavi',
  'Sanya',
  'Shaurya',
  'Tanvi',
  'Veer',
  'Vihaan',
  'Zara',
  'Aanya',
  'Kunal',
  'Manav',
  'Naina',
  'Pranav',
  'Samar',
  'Tara',
  'Yuvaan',
];

const CITIZEN_LAST = [
  'Amin',
  'Bansal',
  'Bhatt',
  'Chopra',
  'Dixit',
  'Gandhi',
  'Iyer',
  'Jain',
  'Kamble',
  'Kohli',
  'Kulkarni',
  'Malhotra',
  'Mehra',
  'Nair',
  'Pandey',
  'Reddy',
  'Saxena',
  'Sharma',
  'Shetty',
  'Singh',
  'Sood',
  'Verma',
  'Yadav',
  'Zaveri',
];

const PER_CITY_INSPECTORS = 3;
const PER_CITY_CITIZENS = 3;

const args = new Set(process.argv.slice(2));
const reset = args.has('--reset');
const preview = args.has('--preview');
const includeCommissioner = !args.has('--no-commissioner');

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'Password@123';

const SPECIAL_PASSWORDS = {
  'citizen.0001@mail.com': 'citizen123',
  'inspector.0001@police.gov.in': 'inspector123',
  'commissioner@police.gov.in': 'commissioner123',
  'vivekdhakate2904@gmail.com': 'vivek123',
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

const buildUsers = async () => {
  const hashedPasswordCache = new Map();
  const getHashedPassword = async (email) => {
    const password = SPECIAL_PASSWORDS[email] || DEFAULT_PASSWORD;
    if (hashedPasswordCache.has(password)) return hashedPasswordCache.get(password);
    const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    hashedPasswordCache.set(password, hashed);
    return hashed;
  };
  const users = [];

  let inspectorCount = 0;
  let citizenCount = 0;

  for (const city of CITIES) {
    for (let i = 0; i < PER_CITY_INSPECTORS; i += 1) {
      inspectorCount += 1;
      const first = INSPECTOR_FIRST[inspectorCount % INSPECTOR_FIRST.length];
      const last = INSPECTOR_LAST[Math.floor(inspectorCount / INSPECTOR_FIRST.length) % INSPECTOR_LAST.length];
      const police_id = `IN${String(inspectorCount).padStart(6, '0')}`;
      const contact = String(7000000000 + inspectorCount);
      const email = `inspector.${String(inspectorCount).padStart(4, '0')}@police.gov.in`;
      const age = 24 + (inspectorCount % 26);

      users.push({
        first_name: first,
        last_name: last,
        fullname: `${first} ${last}`,
        role: 'inspector',
        police_id,
        contact,
        email,
        city,
        age,
        password: await getHashedPassword(email),
        isEmailVerified: true,
        isSuspended: false,
        isApproved: true,
      });
    }

    for (let i = 0; i < PER_CITY_CITIZENS; i += 1) {
      citizenCount += 1;
      const first = CITIZEN_FIRST[citizenCount % CITIZEN_FIRST.length];
      const last = CITIZEN_LAST[Math.floor(citizenCount / CITIZEN_FIRST.length) % CITIZEN_LAST.length];
      const contact = String(8000000000 + citizenCount);
      const email = `citizen.${String(citizenCount).padStart(4, '0')}@mail.com`;
      const aadhar_number = String(400000000000 + citizenCount);
      const age = 18 + (citizenCount % 43);

      users.push({
        first_name: first,
        last_name: last,
        fullname: `${first} ${last}`,
        role: 'citizen',
        contact,
        email,
        city,
        age,
        aadhar_number,
        password: await getHashedPassword(email),
        isEmailVerified: true,
        isSuspended: false,
        isApproved: true,
      });
    }
  }

  if (includeCommissioner) {
    const contact = '9000000001';
    users.push({
      first_name: 'Commissioner',
      last_name: 'Admin',
      fullname: 'Commissioner Admin',
      role: 'commissioner',
      police_id: 'CM000001',
      contact,
      email: 'commissioner@police.gov.in',
      city: CITIES[0],
      age: 45,
      password: await getHashedPassword('commissioner@police.gov.in'),
      isEmailVerified: true,
      isSuspended: false,
      isApproved: true,
    });
  }

  // Vivek's Personal Testing Account
  users.push({
    first_name: 'Vivek',
    last_name: 'Dhakate',
    fullname: 'Vivek Dhakate',
    role: 'inspector',
    police_id: 'IN999999',
    contact: '9999999999',
    email: 'vivekdhakate2904@gmail.com',
    city: CITIES[0], // Defauls to 'Adajan'
    age: 25,
    password: await getHashedPassword('vivekdhakate2904@gmail.com'),
    isEmailVerified: true,
    isSuspended: false,
    isAdmin: false,
    isApproved: true,
  });

  return users;
};

const run = async () => {
  try {
    await connectMongo();
    const users = await buildUsers();

    if (preview) {
      console.log(`[PREVIEW] Users to create: ${users.length}`);
      console.log(users.slice(0, 5));
      return;
    }

    if (reset) {
      await User.deleteMany();
      console.log('[OK] Existing users deleted.');
    }

    await User.insertMany(users, { ordered: true });
    console.log(`[OK] Inserted ${users.length} users.`);
  } catch (err) {
    console.error('[ERROR] User seed failed:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
};

run();
