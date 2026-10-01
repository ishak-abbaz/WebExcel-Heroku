// Import necessary modules
const pool = require('../config/database');
const { parseProductsExcel, clearDirectory, removeStaleProductImages } = require('../utils/excelParser');
const { saveFile, deletePrefixExcept } = require('../utils/storage');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

// Heroku closes requests that send nothing for 30 seconds (error H12).
// For slow imports we start the response early and send a blank space regularly;
// the final JSON is sent at the end (leading spaces are valid JSON).
const KEEPALIVE_START_MS = 10000;
const KEEPALIVE_EVERY_MS = 10000;

function createResponder(res) {
    let streaming = false;
    let interval = null;

    const startTimer = setTimeout(() => {
        if (res.writableEnded || res.headersSent) return;
        streaming = true;
        res.status(200);
        res.setHeader('Content-Type', 'application/json');
        res.flushHeaders();
        res.write(' ');
        interval = setInterval(() => {
            if (!res.writableEnded) res.write(' ');
        }, KEEPALIVE_EVERY_MS);
    }, KEEPALIVE_START_MS);

    const stop = () => {
        clearTimeout(startTimer);
        if (interval) clearInterval(interval);
    };
    res.on('close', stop);

    return {
        send(status, body) {
            stop();
            if (res.writableEnded) return;
            if (streaming) {
                // Status 200 was already sent: the real outcome is in the body
                res.end(JSON.stringify(body));
            } else {
                res.status(status).json(body);
            }
        }
    };
}

// Controller function to handle product imports
async function importProducts(req, res) {
    const responder = createResponder(res);
    const startedAt = Date.now();
    const lap = (label) =>
        console.log(`⏱ import: ${label} at ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

    let client;
    let inTransaction = false;

    try {
        // Get a client from the connection pool (Database connection)
        client = await pool.connect();

        // Check if file uploaded
        if (!req.file) {
            return responder.send(400, { success: false, error: 'No file uploaded' });
        }
        // Get uploaded file path
        const filePath = req.file.path;

        // Parse Excel file (product images are uploaded to the bucket here)
        const { products, imageKeys } = await parseProductsExcel(filePath);
        lap(`parsed ${products.length} products, ${imageKeys.length} images uploaded`);

        // Check if any products were parsed
        if (products.length === 0) {
            fs.unlinkSync(filePath);
            return responder.send(400, { success: false, error: 'No products found in Excel' });
        }
        // Cleanup: remove previous uploaded file after parsing
        const fileName = path.basename(filePath);
        clearDirectory('uploads/imports/', [fileName]);

        await client.query('BEGIN');
        inTransaction = true;

        // Delete all existing products
        await client.query('DELETE FROM products');

        // Insert new products
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

        // Commit transaction
        await client.query('COMMIT');
        inTransaction = false;
        lap('database committed');

        // After a successful import: keep only the new images and the current import file
        // in the bucket. Failures here are logged but do not fail the import.
        try {
            await removeStaleProductImages(imageKeys);

            const importKey = `uploads/imports/${fileName}`;
            await saveFile(importKey, await fsPromises.readFile(filePath), req.file.mimetype);
            await deletePrefixExcept('uploads/imports/', [importKey]);
        } catch (storageError) {
            console.error('Post-import storage cleanup failed:', storageError);
        }
        lap('bucket cleanup done');

        // Success response
        responder.send(200, {
            success: true,
            message: `Successfully imported ${products.length} products`,
            count: products.length
        });

    } catch (error) {
        // Rollback on error
        if (client && inTransaction) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Rollback failed:', rollbackError);
            }
        }
        console.error('Import error:', error);

        // Cleanup uploaded file
        if (req.file && req.file.path) {
            try {
                await fsPromises.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Failed to delete temp file:', unlinkError);
            }
        }

        responder.send(500, {
            success: false,
            error: 'Failed to import products',
            details: error.message
        });
    } finally {
        if (client) client.release();
    }
}

module.exports = { importProducts };