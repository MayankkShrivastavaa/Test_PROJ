const sessionStore = require("../store/sessionStore");

// Protects routes that need a logged-in session (e.g. GET /api/me).
// Reads the session cookie, checks it against sessionStore, and either
// attaches req.userId and calls next(), or responds 401 - the route
// handler itself never has to think about cookies or sessions directly.
const requireSession = (req, res, next) => {
  const sessionId = req.cookies && req.cookies.sid;

  const session = sessionStore.findValidSession(sessionId);

  if (!session) {
    return res.status(401).json({ msg: "Not authenticated" });
  }

  req.userId = session.userId;
  next();
};

module.exports = requireSession;
