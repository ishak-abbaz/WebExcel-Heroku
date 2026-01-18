const express = require('express');
const router = express.Router();
const { upload } = require('../middleware/validateFile');
const { importProducts } = require('../controllers/adminController');

// POST /api/admin/products/import
router.post('/products/import', upload.single('file'), importProducts);

module.exports = router;