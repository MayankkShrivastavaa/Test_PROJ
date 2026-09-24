// Stores OTP "challenges" - one challenge represents one attempt to verify
// a code sent to one channel (email or sms) for one user.
//
// Just like userStore.js, this is a Map instead of a database. It's fine
// for this assignment (see PROJECT_CONTEXT.md), but it means all
// challenges are lost if the server restarts.

const challenges = new Map();

let nextChallengeNumber = 1;

const generateChallengeId = () => {
  const id = `ch_${nextChallengeNumber}`;
  nextChallengeNumber += 1;
  return id;
};

// Creates a new challenge and stores it. Called by otpService whenever a
// fresh OTP is generated (on register, and on every "resend").
const createChallenge = ({ userId, channel, otpHash, expiresAt, maxAttempts }) => {
  const challengeId = generateChallengeId();

  const challenge = {
    challengeId,
    userId,
    channel, // "email" or "sms"
    otpHash,
    expiresAt, // timestamp in ms
    attempts: 0,
    maxAttempts,
    used: false,
  };

  challenges.set(challengeId, challenge);
  return challenge;
};

const findChallenge = (challengeId) => challenges.get(challengeId) || null;

const incrementAttempts = (challengeId) => {
  const challenge = challenges.get(challengeId);
  if (!challenge) return null;
  challenge.attempts += 1;
  return challenge;
};

const markChallengeUsed = (challengeId) => {
  const challenge = challenges.get(challengeId);
  if (!challenge) return null;
  challenge.used = true;
  return challenge;
};

module.exports = {
  createChallenge,
  findChallenge,
  incrementAttempts,
  markChallengeUsed,
};
