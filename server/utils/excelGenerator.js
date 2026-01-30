const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;

/**
 * Generate an Excel file for an order
 * @param {Object} orderData - Order information
 * @param {Array} orderData.items - Array of cart items with product details
 * @param {string} orderData.clientIdentifier - Client identifier
 * @returns {string} - Path to the generated Excel file
 */
async function generateOrderExcel(orderData) {
    const { items, clientIdentifier } = orderData;
    
    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');
    
    // Collect all extra column names from all items
    const extraColumnNames = new Set();
    items.forEach(item => {
        if (item.extra_columns && typeof item.extra_columns === 'object') {
            Object.keys(item.extra_columns).forEach(key => extraColumnNames.add(key));
        }
    });
    
    // Define base columns
    const baseColumns = [
        { header: 'Reference', key: 'reference', width: 15 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Price EXW VALLMOLL', key: 'price_per_unit', width: 15 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Stock', key: 'stock_quantity', width: 12 },
        { header: 'Total', key: 'total', width: 12 },
        { header: 'U.Box', key: 'u.box', width: 12 },
    ];
    
    // Add extra columns dynamically
    const extraColumnsArray = Array.from(extraColumnNames)
    .filter(colName => colName !== 'total')  // ← Exclude "total" from extra columns
    .map(colName => ({
        header: colName,
        key: colName,
        width: 15
    }));
    
    // Combine all columns
    worksheet.columns = [...baseColumns, ...extraColumnsArray];
    
    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2FA3A1' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Add data rows
    items.forEach(item => {
        const rowData = {
            reference: item.reference,
            description: item.description,
            price_per_unit: item.price_per_unit,
            quantity: item.quantity,
            stock_quantity: item.stock_quantity,
            total: item.price_per_unit * item.quantity,
            'u.box': item.units_per_box
        };
        
        // Add extra columns data
        if (item.extra_columns && typeof item.extra_columns === 'object') {
            Object.keys(item.extra_columns).forEach(key => {
                rowData[key] = item.extra_columns[key];
            });
        }
        
        worksheet.addRow(rowData);
    });
    
    // Format price columns
    worksheet.getColumn('price_per_unit').numFmt = '#,##0.00';
    worksheet.getColumn('total').numFmt = '#,##0.00';
    
    // Ensure directory exists
    const ordersDir = path.join(__dirname, '../../uploads/orders');
    await fs.mkdir(ordersDir, { recursive: true });
    
    // Generate filename with timestamp
    const filename = `${clientIdentifier}.xlsx`;
    const filePath = path.join(ordersDir, filename);

    // Save file
    await workbook.xlsx.writeFile(filePath);

    // Return relative path for database storage
    return `/uploads/orders/${filename}`;
}

module.exports = { generateOrderExcel };