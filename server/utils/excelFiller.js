const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;

/**
 * Template cache - loaded once on first use
 */
let templateBuffer = null;
let templateStructure = null;

/**
 * Load and cache the template structure
 */
async function loadTemplateStructure() {
    if (templateStructure) {
        return templateStructure;
    }

    const templatePath = path.join(__dirname, '../../uploads/order_template.xlsx');
    
    try {
        await fs.access(templatePath);
    } catch (error) {
        throw new Error(`Template file not found at: ${templatePath}`);
    }

    // Load template into memory once
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.worksheets[0];

    // Extract structure from template
    const headerRowNumber = 4; // Your header is on row 4
    const sampleRowNumber = 5;  // First data row with sample

    // Get header row
    const headerRow = worksheet.getRow(headerRowNumber);
    const columns = [];
    const columnMap = {};

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const headerValue = cell.value ? cell.value.toString() : '';
        columns.push({
            number: colNumber,
            header: headerValue,
            key: headerValue.toLowerCase().replace(/\s+/g, '_'),
            width: worksheet.getColumn(colNumber).width || 15,
            style: {
                font: cell.font,
                fill: cell.fill,
                alignment: cell.alignment,
                border: cell.border,
                numFmt: cell.numFmt
            }
        });
        columnMap[headerValue.toLowerCase().replace(/[^a-z0-9]+/g, '_')] = colNumber;
    });

    // Get sample row for styling reference
    const sampleRow = worksheet.getRow(sampleRowNumber);
    const sampleRowStyles = {};
    
    columns.forEach(col => {
        const cell = sampleRow.getCell(col.number);
        sampleRowStyles[col.number] = {
            font: cell.font,
            fill: cell.fill,
            alignment: cell.alignment,
            border: cell.border,
            numFmt: cell.numFmt
        };
    });

    // Get rows 1-4 (header section) for cloning
    const headerSection = [];
    for (let i = 1; i <= headerRowNumber; i++) {
        const row = worksheet.getRow(i);
        const rowData = {
            height: row.height,
            cells: []
        };
        
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            rowData.cells.push({
                colNumber,
                value: cell.value,
                formula: cell.formula,
                style: {
                    font: cell.font,
                    fill: cell.fill,
                    alignment: cell.alignment,
                    border: cell.border,
                    numFmt: cell.numFmt
                },
                merge: cell.master ? { master: cell.master } : null
            });
        });
        
        headerSection.push(rowData);
    }

    // Store merged cells info
    const mergedCells = worksheet.model.merges || [];

    templateStructure = {
        columns,
        columnMap,
        sampleRowStyles,
        headerSection,
        headerRowNumber,
        mergedCells,
        sheetName: worksheet.name
    };

    return templateStructure;
}

/**
 * Create HYPERLINK formula for reference
 */
function createReferenceFormula(item) {
    if (item.product_url) {
        return `=HYPERLINK("${item.product_url}", "${item.reference}")`;
    }
    return item.reference;
}

/**
 * Generate an Excel file for an order using cached template structure
 * @param {Object} orderData - Order information
 * @param {Array} orderData.items - Array of cart items with product details
 * @param {string} orderData.clientIdentifier - Client identifier
 * @returns {string} - Path to the generated Excel file
 */
async function generateOrderExcel(orderData) {
    const { items, clientIdentifier } = orderData;
    
    // Load template structure (cached after first call)
    const template = await loadTemplateStructure();
    
    // Create new workbook for this order
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(template.sheetName || 'Products');
    
    // Apply column structure
    worksheet.columns = template.columns.map(col => ({
        key: col.key,
        width: col.width
    }));
    
    // Recreate header section (rows 1-4)
    template.headerSection.forEach((rowData, index) => {
        const row = worksheet.getRow(index + 1);
        row.height = rowData.height;
        
        rowData.cells.forEach(cellData => {
            const cell = row.getCell(cellData.colNumber);
            
            // Set value or formula
            if (cellData.formula) {
                cell.formula = cellData.formula;
            } else {
                cell.value = cellData.value;
            }
            
            // Apply style
            if (cellData.style) {
                Object.assign(cell, cellData.style);
            }
        });
    });
    
    // Apply merged cells from template
    template.mergedCells.forEach(merge => {
        worksheet.mergeCells(merge);
    });
    
    // Get column indices for data population
    const refCol = template.columnMap['reference'];
    const descCol = template.columnMap['description'];
    const priceCol = template.columnMap['price_exw_vallmoll'];
    const qtyCol = template.columnMap['quantity'];
    const stockCol = template.columnMap['stock'];
    const totalCol = template.columnMap['total'];
    const uboxCol = template.columnMap['u_box'];
    
    // Add data rows for each ordered item
    let currentRow = template.headerRowNumber + 1; // Start after header (row 5)
    
    items.forEach(item => {
        const row = worksheet.getRow(currentRow);
        
        // Set values
        if (refCol) {
            const cell = row.getCell(refCol);
            cell.value = createReferenceFormula(item);
            // Apply sample row style
            Object.assign(cell, template.sampleRowStyles[refCol]);
        }
        
        if (descCol && item.description) {
            const cell = row.getCell(descCol);
            cell.value = item.description;
            Object.assign(cell, template.sampleRowStyles[descCol]);
        }
        
        if (priceCol && item.price_per_unit !== undefined) {
            const cell = row.getCell(priceCol);
            cell.value = item.price_per_unit;
            Object.assign(cell, template.sampleRowStyles[priceCol]);
        }
        
        if (qtyCol && item.quantity !== undefined) {
            const cell = row.getCell(qtyCol);
            cell.value = item.quantity;
            Object.assign(cell, template.sampleRowStyles[qtyCol]);
        }
        
        if (stockCol && item.stock_quantity !== undefined) {
            const cell = row.getCell(stockCol);
            cell.value = item.stock_quantity;
            Object.assign(cell, template.sampleRowStyles[stockCol]);
        }
        
        if (totalCol) {
            const cell = row.getCell(totalCol);
            // Create formula: =Price * Quantity
            if (priceCol && qtyCol) {
                const priceColLetter = String.fromCharCode(64 + priceCol);
                const qtyColLetter = String.fromCharCode(64 + qtyCol);
                cell.value = { formula: `${priceColLetter}${currentRow}*${qtyColLetter}${currentRow}` };
            } else {
                cell.value = (item.price_per_unit || 0) * (item.quantity || 0);
            }
            Object.assign(cell, template.sampleRowStyles[totalCol]);
        }
        
        if (uboxCol && item.units_per_box !== undefined) {
            const cell = row.getCell(uboxCol);
            cell.value = item.units_per_box;
            Object.assign(cell, template.sampleRowStyles[uboxCol]);
        }
        
        // Handle extra columns if they exist in template
        if (item.extra_columns && typeof item.extra_columns === 'object') {
            Object.keys(item.extra_columns).forEach(extraKey => {
                const colIndex = template.columnMap[extraKey.toLowerCase()];
                if (colIndex) {
                    const cell = row.getCell(colIndex);
                    cell.value = item.extra_columns[extraKey];
                    if (template.sampleRowStyles[colIndex]) {
                        Object.assign(cell, template.sampleRowStyles[colIndex]);
                    }
                }
            });
        }
        
        currentRow++;
    });
    
    // Ensure output directory exists
    const ordersDir = path.join(__dirname, '../../uploads/orders');
    await fs.mkdir(ordersDir, { recursive: true });
    
    // Generate filename with client identifier
    const filename = `${clientIdentifier}.xlsx`;
    const filePath = path.join(ordersDir, filename);

    // Save the file (disable shared formulas to avoid conflicts)
    await workbook.xlsx.writeFile(filePath, { 
        useSharedFormulas: false 
    });

    // Return relative path for database storage
    return `/uploads/orders/${filename}`;
}

/**
 * Clear template cache (useful for updates)
 */
function clearTemplateCache() {
    templateStructure = null;
    templateBuffer = null;
}

module.exports = { 
    generateOrderExcel,
    clearTemplateCache 
};