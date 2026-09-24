const express = require("express");
const cors = require("cors");
<<<<<<< HEAD
const cookieParser = require("cookie-parser");
=======
>>>>>>> origin/main

const authRoute = require("../backend/routes/authRoute");

const app = express();

// Parses incoming JSON request bodies into req.body
app.use(express.json());

<<<<<<< HEAD
// Parses the "Cookie" header into req.cookies, so requireSession.js can
// read the "sid" session cookie.
app.use(cookieParser());

// The frontend (served from a different local port, e.g. 5500) and the
// backend (e.g. port 5000) are on different origins during local
// development, so the browser blocks fetch() calls between them unless
// the backend explicitly allows it.
//
// `credentials: true` + reflecting the request's own Origin (instead of
// the wildcard "*") is required as soon as cookies are involved: browsers
// refuse to send/accept cookies on a cross-origin request whose CORS
// response uses the wildcard origin. This wasn't needed before Part 2,
// since registration/OTP/MFA never used cookies - login's session
// cookie is what makes this necessary now.
//
// On Vercel, both are served from the same domain (see vercel.json), so
// this becomes same-origin and effectively a no-op in production.
app.use(cors({ origin: true, credentials: true }));
=======
// The frontend (served from a different local port, e.g. 5500) and the
// backend (e.g. port 5000) are on different origins during local
// development, so the browser blocks fetch() calls between them unless
// the backend explicitly allows it. cors() adds the required
// "Access-Control-Allow-Origin" response header.
// On Vercel, both are served from the same domain (see vercel.json),
// so this becomes a harmless no-op in production rather than a
// requirement.
app.use(cors());
>>>>>>> origin/main

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", authRoute);

module.exports = app;
