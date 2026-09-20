const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const challengeStore = require("../store/challengeStore");

const OTP_EXPIRY_MS = 3 * 60 * 1000; // 3 minutes
const MAX_ATTEMPTS = 3;

// A side-channel, dev-only map that remembers the PLAIN otp for each
// challenge, purely so a test-only endpoint can hand it to an evaluator
// during testing. This is intentionally SEPARATE from challengeStore,
// which only ever stores a bcrypt hash. In a real production system this
// map would not exist at all - see the guard in the controller/route.
const devOnlyPlainOtpByChallengeId = new Map();

// Generates a random 6-digit code as a string, e.g. "042917".
// crypto.randomInt is used instead of Math.random() because it's
// cryptographically secure - Math.random() is predictable enough that it
// should never be used for anything security-related, including OTPs.
const generateSixDigitOtp = () => {
  const otp = crypto.randomInt(0, 1000000); // 0 to 999999
  return otp.toString().padStart(6, "0");
};

// Creates a brand new OTP challenge for a user on a given channel
// ("email" or "sms"). Called by:
//   - the register controller, right after a user is created
//   - the "resend code" / "didn't receive the code" endpoints
async function createOtpChallenge(userId, channel) {
  const otp = generateSixDigitOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  const challenge = challengeStore.createChallenge({
    userId,
    channel,
    otpHash,
    expiresAt,
    maxAttempts: MAX_ATTEMPTS,
  });

  // Simulated delivery: in a real system, this is where we'd call an
  // email/SMS provider's API. For this assignment, we just log it, so
  // whoever is running the server locally can see the code.
  console.log(`[SIMULATED ${channel.toUpperCase()}] OTP for user ${userId}: ${otp}`);

  devOnlyPlainOtpByChallengeId.set(challenge.challengeId, otp);

  return {
    challengeId: challenge.challengeId,
    expiresAt: challenge.expiresAt,
  };
}

// Checks a submitted code against a challenge. Returns one clear status
// string so the controller can decide what to tell the frontend, instead
// of the controller re-deriving these rules itself.
//
// Possible statuses:
//   "not_found"    - challengeId doesn't exist (bad/old/expired-from-memory id)
//   "already_used" - this challenge was already verified successfully before
//   "expired"      - past its expiresAt timestamp
//   "max_attempts"reached - too many wrong tries already
//   "wrong"        - code doesn't match; attempts was just incremented
//   "success"      - code matches; challenge is now marked used
async function verifyOtpChallenge(challengeId, submittedCode) {
  const challenge = challengeStore.findChallenge(challengeId);

  if (!challenge) {
    return { status: "not_found" };
  }

  if (challenge.used) {
    return { status: "already_used" };
  }

  if (Date.now() > challenge.expiresAt) {
    return { status: "expired" };
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    return { status: "max_attempts_reached" };
  }

  const isMatch = await bcrypt.compare(submittedCode, challenge.otpHash);

  if (!isMatch) {
    const updated = challengeStore.incrementAttempts(challengeId);
    const attemptsRemaining = updated.maxAttempts - updated.attempts;
    return { status: "wrong", attemptsRemaining };
  }

  challengeStore.markChallengeUsed(challengeId);
  return { status: "success", userId: challenge.userId, channel: challenge.channel };
}

// Test-only helper for the evaluator/dev endpoint. Never called from the
// normal register/verify flow - only from a route that's explicitly
// gated (see routes/authRoute.js).
function getDevOnlyPlainOtp(challengeId) {
  return devOnlyPlainOtpByChallengeId.get(challengeId) || null;
}

module.exports = {
  createOtpChallenge,
  verifyOtpChallenge,
  getDevOnlyPlainOtp,
};
