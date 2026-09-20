// This file is ONLY a Vercel deployment adapter.
// It contains no business logic of its own.
//
// Locally, backend/server.js imports app.js and calls app.listen(PORT)
// to start a normal, always-running server.
//
// On Vercel, there is no long-running server — each request spins up
// (or reuses) a short-lived serverless function. Vercel looks inside
// the /api folder, finds this file, and treats whatever it exports as
// the request handler. Exporting the Express app directly works because
// Express apps are technically just functions of the form (req, res).
require("dotenv").config();

const app = require("../backend/app");

module.exports = app;
