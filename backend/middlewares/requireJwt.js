const jwt = require("jsonwebtoken");

// This is a DELIBERATELY SEPARATE authentication mechanism from
// requireSession.js. The guidelines ask for both a session-based flow
// AND a JWT-based flow to be demonstrated independently - this one
// checks an "Authorization: Bearer <token>" header instead of a cookie,
// and doesn't touch sessionStore at all.
const requireJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ msg: "Missing or malformed Authorization header" });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (error) {
    // Covers both an invalid signature and an expired token - jwt.verify
    // throws for either, and the caller doesn't need to know which.
    return res.status(401).json({ msg: "Invalid or expired token" });
  }
};

module.exports = requireJwt;
