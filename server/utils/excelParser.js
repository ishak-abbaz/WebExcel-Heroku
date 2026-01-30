// Import necessary modules
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

/**
 * Clear directory contents with option to keep specific files
 * @param {string} directoryPath - Path to directory to clear
 * @param {string[]|null} filesToKeep - Array of filenames to keep, or null to clear all
 */
function clearDirectory(directoryPath, filesToKeep = null) {
    try {
        if (fs.existsSync(directoryPath)) {
            const files = fs.readdirSync(directoryPath);
            
            // Convert filesToKeep to Set for faster lookup
            const keepSet = filesToKeep ? new Set(filesToKeep) : null;
            
            let deletedCount = 0;
            let keptCount = 0;
            
            for (const file of files) {
                // Check if file should be kept
                if (keepSet && keepSet.has(file)) {
                    keptCount++;
                    continue;
                }
                
                const filePath = path.join(directoryPath, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isFile()) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                } else if (stat.isDirectory()) {
                    // Recursively delete subdirectories
                    fs.rmSync(filePath, { recursive: true, force: true });
                    deletedCount++;
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

async function parseProductsExcel(filePath) {
    
    const products = [];

    // Use XLSX library for data
    let workbookData;
    try {
        workbookData = XLSX.readFile(filePath, { cellFormula: true });
    } catch (error) {
        return products;
    }
    
    // Extract first sheet (working sheet)
    const sheetName = workbookData.SheetNames[0];
    const worksheet = workbookData.Sheets[sheetName];
    
    // Convert sheet to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: null });
    // If no data, return empty products    
    if (jsonData.length === 0) {
        return products;
    }

    // Get headers from first row
    const headers = Object.keys(jsonData[0]).map(h => h.toLowerCase().trim());
    
    // Validate required columns
    let requiredColumns = ['image', 'reference', 'description', 'price exw vallmoll', 'stock', 'u.box'];
    for (const required of requiredColumns) {
        if (!headers.includes(required)) {
            return products;
        }
    }
    
    // Get image-to-row mapping
    // Method used to extract the right image positioning in Excel file to assign it's approprate reference
    const imageMapping = await getImageRowMapping(filePath);
    
    // Create lookup map: row number -> image info
    const imageByRow = {};
    imageMapping.forEach(img => {
        imageByRow[img.row] = img;
    });
    
    // Directory where to save images
    const imageDir = path.join(__dirname, '../../public/images/products');
    
    // Ensure directory exists
    if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
    }
    
    // Extract and save images with correct mapping
    const zip = new AdmZip(filePath);
    const extractedImages = [];
    
    // Validate first data row for required attributes
    // const firstRow = jsonData[0];
    // requiredColumns = ['Reference', 'Description'];
    // const missingAttributes = [];
    // // If any required attribute is missing in row, log and return empty products
    // for (const col of requiredColumns) {
    //     const value = firstRow[col];
    //     if (value === null || value === undefined) {
    //         missingAttributes.push(col);
    //     }
    // }

    // if (missingAttributes.length > 0) {
    //     return products;
    // }

    // Clear images directory from previous images
    clearDirectory(imageDir, ['.gitkeep']);
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
                            const outputPath = path.join(imageDir, fileName);
                            
                            // Save image
                            fs.writeFileSync(outputPath, imageEntry.getData());
                            
                            // Update jsonData with correct image path
                            jsonData[rowIndex].Image = `public/images/products/${fileName}`;
                            
                            extractedImages.push({
                                row: imgInfo.row,
                                reference: reference,
                                fileName: fileName
                            });
                            
                        }
                    }
                }
            } catch (error) {
                console.error(`✗ Error extracting image for row ${imgInfo.row}:`, error.message);
            }
        }
    }
    
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
    
    return products;
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
    clearDirectory
};