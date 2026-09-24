const crypto = require("crypto");

// Sessions are a different kind of thing from OTP challenges. A
// challengeId just proves someone completed one verification step; a
// sessionId, once issued, IS the user's logged-in access - anyone who
// has it can act as that user until it expires or is logged out. That's
// why session IDs are generated with crypto.randomBytes (long,
// unpredictable) rather than the simple sequential ids ("u_1", "ch_1")
// used elsewhere in this project, where guessability doesn't matter.

const sessions = new Map();

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const generateSessionId = () => crypto.randomBytes(32).toString("hex");

const createSession = (userId) => {
  const sessionId = generateSessionId();

  const session = {
    sessionId,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };

  sessions.set(sessionId, session);
  return session;
};

// Returns the session only if it exists AND hasn't expired. An expired
// session is deleted on the way out, rather than left to linger.
const findValidSession = (sessionId) => {
  if (!sessionId) return null;

  const session = sessions.get(sessionId);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
};

const deleteSession = (sessionId) => {
  sessions.delete(sessionId);
};

module.exports = {
  createSession,
  findValidSession,
  deleteSession,
  SESSION_DURATION_MS,
};
