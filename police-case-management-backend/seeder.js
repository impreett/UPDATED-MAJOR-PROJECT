const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
/* Database seeder script for MongoDB */

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

/* Import required data models */
const User = require('./models/User');
const Case = require('./models/Case');
const Report = require('./models/Report');
const { normalizePeopleField } = require('./utils/people');

const isProduction = process.env.NODE_ENV === 'production';
const LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/';
const PROD_MONGO_URI =
    'mongodb+srv://pritchotaliya206gmailcom:123123123@cluster0.ylfbtmd.mongodb.net/?appName=Cluster0';
const MONGO_URI = isProduction ? PROD_MONGO_URI : LOCAL_MONGO_URI;
const MONGO_DB = 'police_information';

/* MongoDB connection function */
const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('DB Connection Error:', err.message);
        process.exit(1);
    }
};

const sqlFile = fs.readFileSync(`${__dirname}/police_information.sql`, 'utf-8');

/* Parse SQL INSERT statements and extract row data for a specific table */
const parseSqlInsert = (sql, tableName) => {
    const regex = new RegExp(`INSERT INTO \`${tableName}\` \(.*?\) VALUES\n(.*?);`, 'is');
    const match = sql.match(regex);
    if (!match) return [];
    const valuesStr = match[1];
    const rows = valuesStr.match(/\(([^()]*|\([^()]*\))*\)/g);
    if (!rows) return [];
    return rows.map(row => {
        const values = [];
        const parts = row.slice(1, -1).split(',');
        let tempVal = '';
        let inString = false;
        for (const part of parts) {
            if (!inString) {
                if (part.startsWith("'") && !part.endsWith("'")) {
                    inString = true;
                    tempVal = part;
                } else { values.push(part); }
            } else {
                tempVal += ',' + part;
                if (part.endsWith("'")) {
                    inString = false;
                    values.push(tempVal);
                    tempVal = '';
                }
            }
        }
        return values.map(v => {
            let val = v.trim();
            if (val.startsWith("'") && val.endsWith("'")) {
                return val.substring(1, val.length - 1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
            }
            return val;
        });
    });
};

/* Import data function - reads from SQL dump and creates MongoDB documents */
const importData = async () => {
    try {
        await connectDB();
        /* Process user data from SQL */
        const usersToCreate = [];
        const parsedUsers = parseSqlInsert(sqlFile, 'police_registration');
        for (const userRow of parsedUsers) {
            const isAdmin = userRow[6] === "b'1'";
            const hashedPassword = await bcrypt.hash(String(userRow[5] ?? ''), BCRYPT_SALT_ROUNDS);
            usersToCreate.push({
                fullname: userRow[0], police_id: userRow[1], contact: userRow[2],
                email: userRow[3], city: userRow[4], password: hashedPassword,
                role: isAdmin ? 'commissioner' : 'inspector',
                isAdmin,
                isApproved: true,
                isEmailVerified: true,
                isSuspended: false,
            });
        }

        /* Process case data from SQL */
        const parsedCases = parseSqlInsert(sqlFile, 'cases');
        const casesToCreate = parsedCases.map(caseRow => ({
            case_title: caseRow[1], case_type: caseRow[2], case_description: caseRow[3],
            suspects: normalizePeopleField(caseRow[4]),
            victim: normalizePeopleField(caseRow[5]),
            guilty_name: normalizePeopleField(caseRow[6]),
            case_date: new Date(caseRow[7]), case_handler: caseRow[8],
            status: caseRow[9].toUpperCase(), isApproved: caseRow[10] === "b'1'",
        }));

        /* Clear existing collections before import */
        await User.deleteMany();
        await Case.deleteMany();
        await Report.deleteMany();
        console.log('[OK] Previous data destroyed...');

        /* Insert parsed data into MongoDB */
        await User.insertMany(usersToCreate);
        await Case.insertMany(casesToCreate);

        console.log('[OK] Data imported successfully!');
    } catch (err) {
        console.error('[ERROR] Error during import:', err);
    } finally {
        await mongoose.connection.close();
        console.log('MongoDB Connection Closed.');
    }
};

/* Data deletion function - removes all documents from collections */
const deleteData = async () => {
    try {
        await connectDB();
        await User.deleteMany();
        await Case.deleteMany();
        await Report.deleteMany();
        console.log('[OK] Data destroyed successfully...');
    } catch (err) {
        console.error('[ERROR] Error during deletion:', err);
    } finally {
        await mongoose.connection.close();
        console.log('MongoDB Connection Closed.');
    }
};

/* Command line interface: node seeder.js -i (import) | -d (delete) */
if (process.argv[2] === '-i') {
    importData();
} else if (process.argv[2] === '-d') {
    deleteData();
} else {
    console.log('Please provide an option: -i to import, -d to delete');
}
