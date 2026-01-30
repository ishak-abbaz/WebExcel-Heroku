// Required configurations
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET all products
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT reference, description, price_per_unit, stock_quantity, image_url, extra_columns extra, units_per_box FROM products ORDER BY description ASC;'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

module.exports = router;