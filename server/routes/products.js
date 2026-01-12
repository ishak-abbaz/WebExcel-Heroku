// Required configurations
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// POST endpoint to add new product to database
router.post('/', async (req, res) => {
    try{
        const { reference, description, price_per_unit, stock_quantity, image_url, extra_columns } = req.body;
        const query = `
            INSERT INTO products (reference, description, price_per_unit, stock_quantity, image_url, extra_columns)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
        const values = [reference, description, price_per_unit, stock_quantity, image_url, extra_columns];
        const result = await pool.query(query, values);
        res.status(201).json({
            success: true,
            message: 'Product added successfully'
        });
    }catch(error){
        res.status(500).json({ message: 'Failed to add product', error: error.message });
    }
});

router.delete('/:reference', async (req, res) => {
    try{
        const reference = req.params.reference;
        
        const searchQuery = `SELECT * FROM products WHERE reference = $1`;
        const searchResult = await pool.query(searchQuery, [reference]);
        if (searchResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found' 
            });
        }

        const query = `DELETE FROM products WHERE reference = $1 RETURNING *`;
        const result = await pool.query(query, [reference]);
        res.status(201).json({
            success: true,
            message: 'Product deleted successfully'
        });
    }catch(error){
        res.status(500).json({ message: 'Failed to add product', error: error.message });
    }
});
// to be able to use this router in other files
module.exports = router;