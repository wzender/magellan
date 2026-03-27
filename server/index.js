/**
 * Main Server Index
 * Sets up Express server with all API endpoints
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const leaderboardRouter = require('./api/leaderboard');
const runsRouter = require('./api/runs');
const confusionMatrixRouter = require('./api/confusionMatrix');
const transitionMatrixRouter = require('./api/transitionMatrix');
const recordsRouter = require('./api/records');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(compression());
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from client/build directory (if exists) or client/public
const buildPath = path.join(__dirname, '../client/build');
const publicPath = path.join(__dirname, '../client/public');
const staticPath = fs.existsSync(buildPath) ? buildPath : publicPath;
app.use(express.static(staticPath));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes
app.use('/api', leaderboardRouter);
app.use('/api', runsRouter);
app.use('/api', confusionMatrixRouter);
app.use('/api', transitionMatrixRouter);
app.use('/api', recordsRouter);

// Serve React app for all non-API routes
app.get('*', (req, res) => {
  const buildPath = path.join(__dirname, '../client/build/index.html');
  const publicPath = path.join(__dirname, '../client/public/index.html');
  const indexPath = fs.existsSync(buildPath) ? buildPath : publicPath;
  res.sendFile(indexPath);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
