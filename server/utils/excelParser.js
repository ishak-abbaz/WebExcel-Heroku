// Import necessary modules
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const { saveFile, deletePrefixExcept } = require('./storage');

// Product images live in the bucket under this prefix
const IMAGE_PREFIX = 'images/products/';
const UPLOAD_BATCH_SIZE = 10;
const IMAGE_MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
};

/**
 * Clear directory contents with option to keep specific files
 * (still used for the temporary uploads/imports folder on disk)
 * @param {string} directoryPath - Path to directory to clear
 * @param {string[]|null} filesToKeep - Array of filenames to keep, or null to clear all
 */
function clearDirectory(directoryPath, filesToKeep = null) {
    try {
        if (fs.existsSync(directoryPath)) {
            const files = fs.readdirSync(directoryPath);

            // Convert filesToKeep to Set for faster lookup
            const keepSet = filesToKeep ? new Set(filesToKeep) : null;

            for (const file of files) {
                // Check if file should be kept
                if (keepSet && keepSet.has(file)) {
                    continue;
                }

                const filePath = path.join(directoryPath, file);
                const stat = fs.statSync(filePath);

                if (stat.isFile()) {
                    fs.unlinkSync(filePath);
                } else if (stat.isDirectory()) {
                    // Recursively delete subdirectories
                    fs.rmSync(filePath, { recursive: true, force: true });
                }
            }
        } else {
            // Directory does not exist, create it
            fs.mkdirSync(directoryPath, { recursive: true });
        }
    } catch (error) {
        console.error(`❌ Error clearing directory: ${error.message}`);
    }
}

/**
 * Parse the products Excel file.
 * Images are uploaded to the bucket during parsing.
 * @returns {{ products: Array, imageKeys: string[] }}
 */
async function parseProductsExcel(filePath) {

    const products = [];
    const imageKeys = [];

    // Use XLSX library for data
    let workbookData;
    try {
        workbookData = XLSX.readFile(filePath, { cellFormula: true });
    } catch (error) {
        return { products, imageKeys };
    }

    // Extract first sheet (working sheet)
    const sheetName = workbookData.SheetNames[0];
    const worksheet = workbookData.Sheets[sheetName];

    // Convert sheet to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: null });
    // If no data, return empty products
    if (jsonData.length === 0) {
        return { products, imageKeys };
    }

    // Get headers from first row
    const headers = Object.keys(jsonData[0]).map(h => h.toLowerCase().trim());

    // Validate required columns
    let requiredColumns = ['image', 'reference', 'description', 'price exw vallmoll', 'stock', 'u.box'];
    for (const required of requiredColumns) {
        if (!headers.includes(required)) {
            return { products, imageKeys };
        }
    }

    // Get image-to-row mapping
    // Method used to extract the right image positioning in Excel file to assign it's approprate reference
    const imageMapping = await getImageRowMapping(filePath);

    // Extract images and upload them to the bucket with correct mapping
    const zip = new AdmZip(filePath);

    // Images waiting to be uploaded (uploaded in small batches to limit memory use)
    let pending = [];
    const flushPending = async () => {
        const batch = pending;
        pending = [];
        await Promise.all(batch.map(img => saveFile(img.key, img.data, img.mime)));
    };

    // Extract images and map to products
    for (const imgInfo of imageMapping) {
        if (imgInfo.imagePath) {
            try {
                const imageEntry = zip.getEntry(imgInfo.imagePath);

                if (imageEntry) {
                    // Get the reference from the correct row
                    const rowIndex = imgInfo.row - 2; // -2 because: -1 for 0-based, -1 for header

                    if (rowIndex >= 0 && rowIndex < jsonData.length) {
                        const reference = jsonData[rowIndex].Reference;
                        if (reference) {
                            const ext = path.extname(imgInfo.imageFileName);
                            const fileName = `${reference}${ext}`;
                            const key = `${IMAGE_PREFIX}${fileName}`;

                            pending.push({
                                key,
                                data: imageEntry.getData(),
                                mime: IMAGE_MIME[ext.toLowerCase()] || 'application/octet-stream'
                            });
                            imageKeys.push(key);

                            // Update jsonData with correct image path (same value as before)
                            jsonData[rowIndex].Image = `public/images/products/${fileName}`;
                        }
                    }
                }
            } catch (error) {
                console.error(`✗ Error extracting image for row ${imgInfo.row}:`, error.message);
            }

            // Upload errors are NOT swallowed: they abort the import
            if (pending.length >= UPLOAD_BATCH_SIZE) {
                await flushPending();
            }
        }
    }
    await flushPending();

    // Parse each row into product object
    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];

        const rowData = {};
        Object.keys(row).forEach(key => {
            rowData[key.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_')] = row[key];
        });
        const product = {
            image_url: rowData.image || null,
            reference: rowData.reference,
            description: rowData.description,
            price_per_unit: parseFloat(rowData.price_exw_vallmoll) || 0,
            stock_quantity: parseInt(rowData.stock) || 0,
            units_per_box: parseInt(rowData.u_box) || 1,
            extra_columns: {}
        };
        // Storing extra columns data
        const usedColumns = ['image', 'reference', 'description', 'price_exw_vallmoll', 'stock', 'u_box'];
        Object.keys(rowData).forEach(key => {
            if (!usedColumns.includes(key) && rowData[key] !== null && rowData[key] !== undefined) {
                product.extra_columns[key] = rowData[key];
            }
        });

        products.push(product);
    }

    return { products, imageKeys };
}

/**
 * Delete old product images from the bucket (everything except the new ones).
 * Call this only after the database import has been committed.
 */
async function removeStaleProductImages(keepKeys) {
    await deletePrefixExcept(IMAGE_PREFIX, keepKeys);
}

// Method used to extract right image positioning in Excel file to assign its approprate reference
async function getImageRowMapping(filePath) {
    try {
        const zip = new AdmZip(filePath);
        const parser = new xml2js.Parser();

        // Read the drawing XML (contains image positions)
        let drawingXml;
        try {
            drawingXml = zip.readAsText('xl/drawings/drawing1.xml');
        } catch (error) {
            console.log('⚠️ No drawings found in Excel file');
            return [];
        }

        const drawingData = await parser.parseStringPromise(drawingXml);

        // Read drawing relationships (maps drawing elements to actual image files)
        let drawingRelsXml;
        try {
            drawingRelsXml = zip.readAsText('xl/drawings/_rels/drawing1.xml.rels');
        } catch (error) {
            console.log('⚠️ No drawing relationships found');
            return [];
        }

        const drawingRels = await parser.parseStringPromise(drawingRelsXml);

        const imageMapping = [];

        // Parse anchors (image positions)
        const twoCellAnchors = drawingData['xdr:wsDr']?.['xdr:twoCellAnchor'];

        if (!twoCellAnchors) {
            console.log('⚠️ No image anchors found');
            return [];
        }

        for (let i = 0; i < twoCellAnchors.length; i++) {
            const anchor = twoCellAnchors[i];

            // Get the "from" position (where image starts)
            const from = anchor['xdr:from']?.[0];
            if (!from) continue;

            const row = parseInt(from['xdr:row'][0]) + 1; // +1 because Excel is 1-based
            const col = parseInt(from['xdr:col'][0]);

            // Get the image relationship ID
            let imageId = null;
            try {
                const pic = anchor['xdr:pic']?.[0];
                const blipFill = pic?.['xdr:blipFill']?.[0];
                const blip = blipFill?.['a:blip']?.[0];
                imageId = blip?.$?.['r:embed'];
            } catch (e) {
                console.log(`⚠️ Could not extract image ID for anchor ${i}`);
                continue;
            }

            // Find the actual image file path from relationships
            let imagePath = null;
            let imageFileName = null;

            if (imageId && drawingRels.Relationships?.Relationship) {
                const rel = drawingRels.Relationships.Relationship.find(
                    r => r.$.Id === imageId
                );

                if (rel) {
                    // Target is like "../media/image1.png"
                    imagePath = 'xl/' + rel.$.Target.replace('../', '');
                    imageFileName = path.basename(imagePath);
                }
            }

            imageMapping.push({
                row: row,
                column: col,
                imageId: imageId,
                imagePath: imagePath,
                imageFileName: imageFileName,
                anchorIndex: i
            });
        }

        return imageMapping;

    } catch (error) {
        console.error('❌ Error getting image row mapping:', error);
        return [];
    }
}

module.exports = {
    parseProductsExcel,
    removeStaleProductImages,
    clearDirectory
};