// Ensure all necessary dependencies are installed
const express = require('express');
const path = require('path');
// Ensure config file exists with environment variables
require('dotenv').config();
const productsRoute = require('./routes/products');
// Initialize Express application and set port
const app = express();
const PORT = process.env.PORT || 3000;

// Parse incoming JSON and URL-encoded data
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/products', productsRoute);

// Test database connection
const pool = require('./config/database');
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
    } else {
        console.log('✅ Database connected at:', res.rows[0].now);
    }
});

// Simple route to test if server is running 
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
    // res.send("Server is running");
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
