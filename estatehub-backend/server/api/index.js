// api/index.js
// Vercel entry point. Vercel runs this as a serverless function: it imports the Express app and invokes it
// per request — nothing here (or anywhere on this path) calls app.listen(). Local development is unchanged:
// `npm run dev` still starts server.js, which verifies MySQL and then listens.
//
// vercel.json rewrites every path to this file, so Express sees the original URL (e.g. /api/properties).

const app = require('../src/app');

module.exports = app;
