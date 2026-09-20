// This is our "fake database" for this assignment.
// A JavaScript Map is just a key-value store that lives in server memory.
// It works exactly like a real database for our purposes (create/find users),
// but everything is lost when the server restarts. That trade-off is
// explained in PROJECT_CONTEXT.md.

const usersById = new Map();
const emailIndex = new Map(); // email -> userId, so lookups by email are fast

let nextId = 1;

const generateUserId = () => {
  const id = `u_${nextId}`;
  nextId += 1;
  return id;
};

const findUserByEmail = (email) => {
  const userId = emailIndex.get(email.toLowerCase());
  if (!userId) return null;
  return usersById.get(userId) || null;
};

const findUserById = (userId) => usersById.get(userId) || null;

const createUser = ({ fullName, email, mobile, passwordHash }) => {
  const id = generateUserId();

  const user = {
    id,
    fullName,
    email: email.toLowerCase(),
    mobile,
    passwordHash,
    emailVerified: false,
    mobileVerified: false,
    mfaEnabled: false,
    mfaSecret: null, // set once MFA setup begins, in setMfaSecret()
    createdAt: new Date().toISOString(),
  };

  usersById.set(id, user);
  emailIndex.set(user.email, id);

  return user;
};

const markEmailVerified = (userId) => {
  const user = usersById.get(userId);
  if (!user) return null;
  user.emailVerified = true;
  return user;
};

const markMobileVerified = (userId) => {
  const user = usersById.get(userId);
  if (!user) return null;
  user.mobileVerified = true;
  return user;
};

// Used by "Wrong number? Change" on the Mobile OTP screen - updates the
// stored mobile number so a fresh SMS OTP can be sent to the corrected
// number. Verification status resets to false since the old number was
// never actually confirmed as belonging to this user.
const updateMobile = (userId, mobile) => {
  const user = usersById.get(userId);
  if (!user) return null;
  user.mobile = mobile;
  user.mobileVerified = false;
  return user;
};

// Used by MFA setup - stores the TOTP secret on the user record. Note
// this does NOT mark mfaEnabled true yet: the secret is only "pending"
// until the user proves they've actually set it up correctly by
// submitting a valid code (see markMfaEnabled).
const setMfaSecret = (userId, secret) => {
  const user = usersById.get(userId);
  if (!user) return null;
  user.mfaSecret = secret;
  return user;
};

const markMfaEnabled = (userId) => {
  const user = usersById.get(userId);
  if (!user) return null;
  user.mfaEnabled = true;
  return user;
};

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  markEmailVerified,
  markMobileVerified,
  updateMobile,
  setMfaSecret,
  markMfaEnabled,
};
