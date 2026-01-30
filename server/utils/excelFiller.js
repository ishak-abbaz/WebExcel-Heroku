const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;

/**
 * Extract reference from HYPERLINK formula
 * @param {Object} cell - ExcelJS cell object
 * @returns {string|null} - Extracted reference or null
 */
function extractReferenceFromCell(cell) {
    // Check if cell has a hyperlink formula
    if (cell.formula && typeof cell.formula === 'string' && cell.formula.includes('HYPERLINK')) {
        // Extract the display text (second parameter of HYPERLINK)
        const match = cell.formula.match(/HYPERLINK\([^,]+,\s*"([^"]+)"\)/);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    
    // If not a formula, return cell value directly
    if (cell.value && typeof cell.value === 'string') {
        return cell.value.trim();
    }
    
    return null;
}

/**
 * Generate an Excel file for an order using a template
 * @param {Object} orderData - Order information
 * @param {Array} orderData.items - Array of cart items with product details
 * @param {string} orderData.clientIdentifier - Client identifier
 * @returns {string} - Path to the generated Excel file
 */
async function generateOrderExcel(orderData) {
    const { items, clientIdentifier } = orderData;
    
    // Path to the template file
    const templatePath = path.join(__dirname, '../../uploads/order_template.xlsx');
    
    // Check if template exists
    try {
        await fs.access(templatePath);
    } catch (error) {
        throw new Error(`Template file not found at: ${templatePath}`);
    }
    
    // Load the template workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    
    // Get the first worksheet (or you can specify by name)
    const worksheet = workbook.worksheets[0];
    
    // Create a map of ordered items by reference for quick lookup
    const orderedItemsMap = new Map();
    items.forEach(item => {
        orderedItemsMap.set(item.reference, item);
    });
    
    // Find column indices by header name
    let referenceColIndex = null;
    let quantityColIndex = null;
    let stockColIndex = null;
    
    // Read header row to find column positions
    const headerRow = worksheet.getRow(4);
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const headerValue = cell.value ? cell.value.toString().toLowerCase() : '';
        
        if (headerValue.includes('reference')) {
            referenceColIndex = colNumber;
        } else if (headerValue.includes('quantity') || headerValue === 'quantity') {
            quantityColIndex = colNumber;
        } else if (headerValue.includes('stock')) {
            stockColIndex = colNumber;
        }
    });
    
    if (!referenceColIndex || !quantityColIndex) {
        throw new Error('Required columns (Reference, Quantity) not found in template');
    }
    
    // Iterate through all rows (starting from row 5, after header)
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        // Skip header row
        if (rowNumber <= 4) return;
        
        // Get the reference cell
        const referenceCell = row.getCell(referenceColIndex);
        const reference = extractReferenceFromCell(referenceCell);
        
        if (!reference) return;
        
        // Check if this reference is in the ordered items
        const orderedItem = orderedItemsMap.get(reference);
        
        if (orderedItem) {
            // Update quantity
            const quantityCell = row.getCell(quantityColIndex);
            quantityCell.value = orderedItem.quantity;
            
            // Update stock if column exists and item has stock_quantity
            if (stockColIndex && orderedItem.stock_quantity !== undefined) {
                const stockCell = row.getCell(stockColIndex);
                stockCell.value = orderedItem.stock_quantity;
            }
        }
    });
    
    // Ensure output directory exists
    const ordersDir = path.join(__dirname, '../../uploads/orders');
    await fs.mkdir(ordersDir, { recursive: true });
    
    // Generate filename with client identifier
    const filename = `${clientIdentifier}.xlsx`;
    const filePath = path.join(ordersDir, filename);

    // Save the modified file
    await workbook.xlsx.writeFile(filePath);

    // Return relative path for database storage
    return `/uploads/orders/${filename}`;
}

module.exports = { generateOrderExcel };