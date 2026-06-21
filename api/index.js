const { app, bootstrapPromise } = require('../server.js');

// Vercel serverless function entry point
module.exports = async (req, res) => {
  // Wait for the server's asynchronous bootstrap (MongoDB connection, models, routes)
  await bootstrapPromise;
  
  // Forward the request to the Express app
  return app(req, res);
};
