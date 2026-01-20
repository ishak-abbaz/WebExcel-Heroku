// Ensure postgresql is installed
const { Pool } = require('pg');
// Ensure config file exists with environment variables
require('dotenv').config();
// New pool instance (instantiating connection to the database)
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// Error handling
pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
});
// Export pool object to use it inside other files
module.exports = pool;