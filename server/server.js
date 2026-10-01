// server/server.js
require('dotenv').config();
const express = require('express');
const path = require('path');

const adminRoutes = require('./routes/admin');
const productsRoutes = require('./routes/products');
const ordersRoutes = require('./routes/orders');
const pool = require('./config/database');
const { getFile } = require('./utils/storage');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse incoming JSON
app.use(express.json());

// Static files committed to git (css, js, plugins, html, committed images)
app.use(express.static(path.join(__dirname, '../public')));

// Send a file stored in the bucket to the browser
async function sendFromBucket(res, key, { download = false, cache = false } = {}) {
  try {
    const file = await getFile(key);
    res.set('Content-Type', file.ContentType || 'application/octet-stream');
    if (cache) res.set('Cache-Control', 'public, max-age=86400');
    if (download) {
      const filename = path.basename(key).replace(/"/g, '');
      res.set('Content-Disposition', `attachment; filename="${filename}"`);
    }
    file.Body.on('error', () => res.end());
    file.Body.pipe(res);
  } catch (err) {
    res.status(404).end();
  }
}

// Images: used when the file is not in public/images (runtime uploads live in the bucket)
app.use('/images', (req, res) => {
  const name = decodeURIComponent(req.path).replace(/^\/+/, '');
  if (!name || name.includes('..')) return res.status(400).end();
  sendFromBucket(res, `images/${name}`, { cache: true });
});

// Uploads (order files, imports): replaces the old express.static('/uploads')
// Keeps existing /uploads/... links working, now served from the bucket
app.use('/uploads', (req, res) => {
  const name = decodeURIComponent(req.path).replace(/^\/+/, '');
  if (!name || name.includes('..')) return res.status(400).end();
  sendFromBucket(res, `uploads/${name}`, { download: true });
});

// API routes
app.use('/api/admin', adminRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);

// Test database connection
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});