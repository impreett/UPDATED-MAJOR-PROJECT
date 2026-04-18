const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

app.use('/api/users', require('./routes/users'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/commissioner', require('./routes/admin'));
// Backward-compatible alias
app.use('/api/admin', require('./routes/admin'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/fines', require('./routes/fines'));
app.use('/api/case-transfer', require('./routes/case-transfer'));

app.get('/', (_req, res) => {
    res.send('Police Case Management API is running...');
});

// Ignore favicon requests to prevent 404 errors in the console
app.get('/favicon.ico', (req, res) => res.status(204).end());

connectMongo()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Backend server is running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });
