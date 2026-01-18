// Ensure all necessary dependencies are installed
const express = require('express');
const path = require('path');

// Ensure config file exists with environment variables
require('dotenv').config();
const adminRoutes = require('./routes/admin');
const productsRoutes = require('./routes/products');


// Initialize Express application and set port
const app = express();
const PORT = process.env.PORT || 3000;

// Parse incoming JSON and URL-encoded data
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/admin', adminRoutes);
app.use('/api/products', productsRoutes);
// Test database connection
const pool = require('./config/database');
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
    } else {
        console.log('✅ Database connected at:', res.rows[0].now);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
