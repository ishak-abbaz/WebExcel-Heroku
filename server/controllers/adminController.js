// Import necessary modules
const pool = require('../config/database');
const { parseProductsExcel, clearDirectory } = require('../utils/excelParser');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
// Controller function to handle product imports
async function importProducts(req, res) {
    // Get a client from the connection pool (Database connection)
    const client = await pool.connect();
    
    try {
        // Check if file uploaded
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Get uploaded file path
        const filePath = req.file.path;

        // Parse Excel file
        const products = await parseProductsExcel(filePath);
        // Check if any products were parsed
        if (products.length === 0) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'No products found in Excel' });
        }
        // Cleanup: remove previous uploaded file after parsing
        const fileName = path.basename(filePath);
        clearDirectory('uploads/imports/', [fileName]);

        await client.query('BEGIN');
        
        // Delete all existing products
        await client.query('DELETE FROM products');
        
        // Insert new products
        if (products.length > 0) {
            const CHUNK_SIZE = 100;
            for (let i = 0; i < products.length; i += CHUNK_SIZE) {
                // Create chunk that fits in CHUNK_SIZE
                const chunk = products.slice(i, i + CHUNK_SIZE);
                // Prepare parameterized query for batch insert(CHUNK_SIZE inserts at once)
                const values = chunk.map((_, idx) => {
                    const offset = idx * 7;
                    return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7})`;
                }).join(', ');
                // Parameters for all products in chunk
                const params = chunk.flatMap(p => [
                    p.reference,
                    p.description,
                    p.price_per_unit,
                    p.stock_quantity,
                    p.image_url,
                    JSON.stringify(p.extra_columns),
                    p.units_per_box
                ]);
                // Final query for the chunk insertion
                const query = `
                    INSERT INTO products (
                        reference, description, price_per_unit, 
                        stock_quantity, image_url, extra_columns, units_per_box
                    )
                    VALUES ${values}
                `;
                // Execute the batch insert
                await client.query(query, params);

            }
        }

        // Commit transaction
        await client.query('COMMIT');
        
        // Success response
        res.status(200).json({
            success: true,
            message: `Successfully imported ${products.length} products`,
            count: products.length
        });
        
    } catch (error) {
        // Rollback on error
        await client.query('ROLLBACK');
        console.error('Import error:', error);
        
        // Cleanup uploaded file
        if (req.file && req.file.path) {
            try {
                await fsPromises.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Failed to delete temp file:', unlinkError);
            }
        }
        
        res.status(500).json({
            error: 'Failed to import products',
            details: error.message
        });
    } finally {
        client.release();
    }
}

module.exports = { importProducts };