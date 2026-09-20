const express = require("express");
const cors = require("cors");

const authRoute = require("../backend/routes/authRoute");

const app = express();

// Parses incoming JSON request bodies into req.body
app.use(express.json());

// The frontend (served from a different local port, e.g. 5500) and the
// backend (e.g. port 5000) are on different origins during local
// development, so the browser blocks fetch() calls between them unless
// the backend explicitly allows it. cors() adds the required
// "Access-Control-Allow-Origin" response header.
// On Vercel, both are served from the same domain (see vercel.json),
// so this becomes a harmless no-op in production rather than a
// requirement.
app.use(cors());

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", authRoute);

module.exports = app;
