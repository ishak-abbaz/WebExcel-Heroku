const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { generateOrderExcel } = require('../utils/excelGenerator');

/**
 * POST /api/orders
 * Create a new order with stock updates
 */
router.post('/', async (req, res) => {
    const { clientIdentifier, items } = req.body;
    // console.log('We are recieving data');
    // Validation
    if (!clientIdentifier || !clientIdentifier.trim()) {
        return res.status(400).json({ error: 'Client identifier is required' });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Order must contain at least one item' });
    }
    
    // Start transaction
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Fetch all products from database
        const allProductsQuery = await client.query(
            'SELECT reference, description, price_per_unit, stock_quantity, extra_columns FROM products ORDER BY reference'
        );
        // Create a map of ordered items for quick lookup
        const orderedItemsMap = new Map(
            items.map(item => [item.reference, item.quantity])
        );
        
        // Validate stock for ordered items only
        for (const item of items) {
            const product = allProductsQuery.rows.find(p => p.reference === item.reference);
            
            if (!product) {
                throw new Error(`Product ${item.reference} not found`);
            }
            
            if (product.stock_quantity < item.quantity) {
                throw new Error(`Insufficient stock for ${item.reference}. Available: ${product.stock_quantity}, Requested: ${item.quantity}`);
            }
        }
        
        // Build enriched items with ALL products
        const enrichedItems = allProductsQuery.rows.map(product => {
            const orderedQuantity = orderedItemsMap.get(product.reference) || 0;
            
            return {
                reference: product.reference,
                description: product.description,
                price_per_unit: parseFloat(product.price_per_unit),
                stock_quantity: product.stock_quantity,
                quantity: orderedQuantity,
                extra_columns: product.extra_columns || {}
            };
        });

        // Calculate totals
        const productCount = enrichedItems.reduce((sum, item) => sum + item.quantity, 0);
        const totalAmount = enrichedItems
                    .filter(item => item.quantity > 0)
                    .reduce((sum, item) => 
                        sum + (item.price_per_unit * item.quantity), 0
                    );
        
        // Create order record (get order number first)
        const orderResult = await client.query(
            `INSERT INTO orders (client_identifier, file_path, product_count, total_amount) 
             VALUES ($1, $2, $3, $4) 
             RETURNING order_number`,
            [clientIdentifier, 'pending', productCount, totalAmount]
        );
        
        const orderNumber = orderResult.rows[0].order_number;
        
        // Generate Excel file
        const filePath = await generateOrderExcel({
            items: enrichedItems,
            clientIdentifier
            // orderNumber
        });
        // console.log(`Enriched items count: ${enrichedItems.length}`)
        // const filePath = 'uploads/orders/file.xlsx';
        
        // 5. Update order with file path
        await client.query(
            'UPDATE orders SET file_path = $1 WHERE order_number = $2',
            [filePath, orderNumber]
        );
        
        // 6. Update stock quantities for all products
        for (const item of items) {
            await client.query(
                'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE reference = $2',
                [item.quantity, item.reference]
            );
        }
        
        // Commit transaction
        await client.query('COMMIT');
        
        // Return success response
        res.json({
            success: true,
            orderNumber,
            filePath,
            productCount,
            totalAmount: totalAmount.toFixed(2),
            message: 'Order created successfully'
        });
        
    } catch (error) {
        // Rollback on error
        await client.query('ROLLBACK');
        console.error('Order creation error:', error);
        
        res.status(400).json({ 
            error: error.message || 'Failed to create order'
        });
        
    } finally {
        client.release();
    }
});

/**
 * GET /api/orders
 * Get all orders (for admin dashboard - Sprint 4)
 */
// router.get('/', async (req, res) => {
//     try {
//         const result = await pool.query(
//             'SELECT * FROM orders ORDER BY created_at DESC'
//         );
//         res.json(result.rows);
//     } catch (error) {
//         console.error('Error fetching orders:', error);
//         res.status(500).json({ error: 'Failed to fetch orders' });
//     }
// });

/**
 * GET /api/orders/:id
 * Get specific order details
 */
// router.get('/:id', async (req, res) => {
//     try {
//         const { id } = req.params;
//         const result = await pool.query(
//             'SELECT * FROM orders WHERE order_number = $1',
//             [id]
//         );
        
//         if (result.rows.length === 0) {
//             return res.status(404).json({ error: 'Order not found' });
//         }
        
//         res.json(result.rows[0]);
//     } catch (error) {
//         console.error('Error fetching order:', error);
//         res.status(500).json({ error: 'Failed to fetch order' });
//     }
// });

module.exports = router;