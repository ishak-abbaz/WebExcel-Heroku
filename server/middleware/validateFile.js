// Import needed dependancies
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Function to clear directory
// function clearDirectory(directoryPath) {
//     try {
//         if (fs.existsSync(directoryPath)) {
//             const files = fs.readdirSync(directoryPath);
            
//             for (const file of files) {
//                 const filePath = path.join(directoryPath, file);
//                 const stat = fs.statSync(filePath);
                
//                 if (stat.isFile()) {
//                     fs.unlinkSync(filePath);
//                 } else if (stat.isDirectory()) {
//                     // Recursively delete subdirectories
//                     fs.rmSync(filePath, { recursive: true, force: true });
//                 }
//             }
            
//             console.log(`✅ Cleared directory: ${directoryPath}`);
//         } else {
//             fs.mkdirSync(directoryPath, { recursive: true });
//             console.log(`✅ Created directory: ${directoryPath}`);
//         }
//     } catch (error) {
//         console.error(`❌ Error clearing directory: ${error.message}`);
//         // throw error;
//     }
// }

// Configure multer temporary storage for excel file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/imports/');
    },
    filename: (req, file, cb) => {
        const uniqueName = `products-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({

    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only Excel files allowed.'));
        }
    }
});

module.exports = { upload };