// Vercel Serverless Function - API entry point
// Imports the Express app from the built server bundle

const { app } = require('../dist-server/server.js');

// Export the Express app for Vercel
module.exports = app;
