// Ensure postgresql is installed
const { Pool } = require('pg');
// Ensure config file exists with environment variables
require('dotenv').config();
// New pool instance (instantiating connection to the database)
const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    })
    : new Pool({
        host: process.env.DB_HOST || 'postgres',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'webexcel'
    });


// Error handling
pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
});
// Export pool object to use it inside other files
module.exports = pool;