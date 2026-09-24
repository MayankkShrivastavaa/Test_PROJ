const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const userStore = require("../store/userStore");
const otpService = require("../services/otpService");
const mfaService = require("../services/mfaService");
const sessionStore = require("../store/sessionStore");
const {
  isValid,
  isValidFullName,
  isValidEmail,
  isValidMobile,
  checkPasswordStrength,
} = require("../utils/validators");

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const JWT_EXPIRES_IN = "15m";

// Cookie options for the session cookie. Secure+SameSite=None is the
// correct combination for a real cross-site production cookie, but
// browsers reject "Secure" cookies over plain http - so locally
// (NODE_ENV !== "production", usually plain http) we fall back to a
// non-Secure cookie so login still works during local development. See
// PROJECT_CONTEXT.md for the full explanation of why cross-origin local
// dev (frontend on :5500, backend on :5000) makes this genuinely tricky,
// and why testing the full session flow is more reliable on the
// deployed (same-origin, https) Vercel URL.
const getSessionCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "lax" : "lax",
    maxAge: sessionStore.SESSION_DURATION_MS,
  };
};

// POST /api/register
const registerUser = async (req, res) => {
  try {
    const data = req.body;

    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ msg: "Bad Request! No Data Provided" });
    }

    const { fullName, email, countryCode, mobile, password } = data;

    // --- Full Name ---
    if (!isValid(fullName)) {
      return res.status(400).json({ msg: "Full Name is Required" });
    }
    if (!isValidFullName(fullName)) {
      return res.status(400).json({ msg: "Invalid Full Name" });
    }

    // --- Email ---
    if (!isValid(email)) {
      return res.status(400).json({ msg: "Email is Required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ msg: "Invalid Email" });
    }

    const existingUser = userStore.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ msg: "Email Already Registered" });
    }

    // --- Mobile ---
    if (!isValid(mobile)) {
      return res.status(400).json({ msg: "Mobile Number is Required" });
    }
    if (!isValidMobile(mobile)) {
      return res.status(400).json({ msg: "Invalid Mobile Number" });
    }

    // --- Password ---
    if (!isValid(password)) {
      return res.status(400).json({ msg: "Password is Required" });
    }

    const strength = checkPasswordStrength(password);
    if (!strength.isStrongEnough) {
      return res.status(400).json({
        msg: "Password does not meet the minimum requirements",
        passwordRules: strength,
      });
    }

    // --- Hash password (never store or return the plain password) ---
    const passwordHash = await bcrypt.hash(password, 10);

    // --- Create user ---
    const fullMobile = `${countryCode || "+91"}${mobile}`;
    const user = userStore.createUser({
      fullName: fullName.trim(),
      email,
      mobile: fullMobile,
      passwordHash,
    });

    // Registration is complete, but the journey isn't - the guidelines
    // require the user to verify their email next. We generate that OTP
    // challenge right here rather than making the frontend fire a second
    // request immediately after registering.
    const emailChallenge = await otpService.createOtpChallenge(user.id, "email");

    return res.status(201).json({
      msg: "Account created successfully",
      nextStep: "email-otp", // tells the frontend which screen to show next
      challengeId: emailChallenge.challengeId,
      expiresAt: emailChallenge.expiresAt,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        emailVerified: user.emailVerified,
        mobileVerified: user.mobileVerified,
        mfaEnabled: user.mfaEnabled,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

// POST /api/send-email-otp
// Used for "Resend code" / "Didn't receive the code?". Always creates a
// brand new challenge (old one, if any, is simply abandoned/expired) -
// this keeps the OTP model simple: one challengeId always maps to
// exactly one still-valid code.
const sendEmailOtp = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!isValid(userId)) {
      return res.status(400).json({ msg: "userId is Required" });
    }

    const user = userStore.findUserById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User Not Found" });
    }

    const challenge = await otpService.createOtpChallenge(userId, "email");

    return res.status(200).json({
      msg: "OTP sent",
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

// POST /api/verify-email-otp
const verifyEmailOtp = async (req, res) => {
  try {
    const { challengeId, code } = req.body;

    if (!isValid(challengeId)) {
      return res.status(400).json({ msg: "challengeId is Required" });
    }
    if (!isValid(code)) {
      return res.status(400).json({ msg: "code is Required" });
    }

    const result = await otpService.verifyOtpChallenge(challengeId, code);

    switch (result.status) {
      case "not_found":
        return res.status(404).json({ msg: "Challenge Not Found" });

      case "already_used":
        return res.status(400).json({ msg: "This code has already been used" });

      case "expired":
        return res.status(400).json({
          msg: "This code has expired",
          codeExpired: true,
        });

      case "max_attempts_reached":
        return res.status(429).json({
          msg: "Maximum attempts reached. Please request a new code.",
          maxAttemptsReached: true,
        });

      case "wrong":
        return res.status(400).json({
          msg: "Incorrect code. Please try again.",
          attemptsRemaining: result.attemptsRemaining,
        });

      case "success": {
        userStore.markEmailVerified(result.userId);

        // Email is verified - the journey continues straight into SMS
        // verification, so we generate that challenge here immediately,
        // the same way registerUser() does for the email challenge.
        const smsChallenge = await otpService.createOtpChallenge(result.userId, "sms");
        const user = userStore.findUserById(result.userId);

        return res.status(200).json({
          msg: "Email verified successfully",
          nextStep: "sms-otp",
          challengeId: smsChallenge.challengeId,
          expiresAt: smsChallenge.expiresAt,
          mobile: user.mobile,
        });
      }

      default:
        return res.status(500).json({ msg: "Internal Server Error" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

// POST /api/send-sms-otp
// Used for "Resend code" on the Mobile OTP screen. Same pattern as
// sendEmailOtp - always issues a brand new challenge.
const sendSmsOtp = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!isValid(userId)) {
      return res.status(400).json({ msg: "userId is Required" });
    }

    const user = userStore.findUserById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User Not Found" });
    }

    const challenge = await otpService.createOtpChallenge(userId, "sms");

    return res.status(200).json({
      msg: "OTP sent",
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

// POST /api/verify-sms-otp
// Same shape as verifyEmailOtp, but on success it moves the user on to
// MFA setup (Phase 4) instead of SMS, and it marks mobileVerified
// instead of emailVerified.
const verifySmsOtp = async (req, res) => {
  try {
    const { challengeId, code } = req.body;

    if (!isValid(challengeId)) {
      return res.status(400).json({ msg: "challengeId is Required" });
    }
    if (!isValid(code)) {
      return res.status(400).json({ msg: "code is Required" });
    }

    const result = await otpService.verifyOtpChallenge(challengeId, code);

    switch (result.status) {
      case "not_found":
        return res.status(404).json({ msg: "Challenge Not Found" });

      case "already_used":
        return res.status(400).json({ msg: "This code has already been used" });

      case "expired":
        return res.status(400).json({
          msg: "This code has expired",
          codeExpired: true,
        });

      case "max_attempts_reached":
        return res.status(429).json({
          msg: "Maximum attempts reached. Please request a new code.",
          maxAttemptsReached: true,
        });

      case "wrong":
        return res.status(400).json({
          msg: "Incorrect code. Please try again.",
          attemptsRemaining: result.attemptsRemaining,
        });

      case "success": {
        userStore.markMobileVerified(result.userId);
        return res.status(200).json({
          msg: "Mobile number verified successfully",
          nextStep: "mfa-setup",
        });
      }

      default:
        return res.status(500).json({ msg: "Internal Server Error" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

// POST /api/change-mobile
// Backs the "Wrong number? Change" link on the Mobile OTP screen. Updates
// the user's stored mobile number and immediately issues a fresh SMS
// challenge for the corrected number - the old challenge is simply
// abandoned, same pattern as every other "resend".
const changeMobile = async (req, res) => {
  try {
    const { userId, countryCode, mobile } = req.body;

    if (!isValid(userId)) {
      return res.status(400).json({ msg: "userId is Required" });
    }

    const user = userStore.findUserById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User Not Found" });
    }

    if (!isValid(mobile)) {
      return res.status(400).json({ msg: "Mobile Number is Required" });
    }
    if (!isValidMobile(mobile)) {
      return res.status(400).json({ msg: "Invalid Mobile Number" });
    }

    const fullMobile = `${countryCode || "+91"}${mobile}`;
    const updatedUser = userStore.updateMobile(userId, fullMobile);

    const challenge = await otpService.createOtpChallenge(userId, "sms");

    return res.status(200).json({
      msg: "Mobile number updated",
      mobile: updatedUser.mobile,
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};


// POST /api/mfa/setup
// Starts MFA setup for the Authenticator App path (the only method this
// assignment actually implements, per the earlier architecture decision
// - the Set Up MFA screen still visually shows SMS/Email options, but
// only this one is wired to a real backend flow). Generates a brand new
// TOTP secret and QR code every time it's called - if the user backs out
// and re-enters this screen, they simply get a fresh secret and scan
// again, which is simpler than trying to resume a half-finished setup.
const setupMfa = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!isValid(userId)) {
      return res.status(400).json({ msg: "userId is Required" });
    }

    const user = userStore.findUserById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User Not Found" });
    }

    const { secret, qrCodeDataUrl } = await mfaService.generateMfaSetup(user.email);

    // Stored now, but mfaEnabled stays false until verifyMfa succeeds -
    // see userStore.setMfaSecret's comment for why.
    userStore.setMfaSecret(user.id, secret);

    return res.status(200).json({
      msg: "Scan the QR code with your authenticator app",
      qrCodeDataUrl,
      setupKey: secret, // manual fallback for "Can't scan? Enter setup key"
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

// POST /api/mfa/verify
// Checks the 6-digit code the user's authenticator app is currently
// showing, against the secret generated in setupMfa. On success, this is
// the final step of the whole registration journey.
const verifyMfa = async (req, res) => {
  try {
    const { userId, code } = req.body;

    if (!isValid(userId)) {
      return res.status(400).json({ msg: "userId is Required" });
    }
    if (!isValid(code)) {
      return res.status(400).json({ msg: "code is Required" });
    }

    const user = userStore.findUserById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User Not Found" });
    }

    if (!user.mfaSecret) {
      return res.status(400).json({ msg: "MFA setup has not been started for this user" });
    }

    const isCodeValid = mfaService.verifyTotpCode(user.mfaSecret, code);

    if (!isCodeValid) {
      return res.status(400).json({
        msg: "Invalid code. Please try again.",
        invalidCode: true,
      });
    }

    userStore.markMfaEnabled(user.id);

    return res.status(200).json({
      msg: "MFA enabled successfully",
      nextStep: "success",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};


// POST /api/login
// Step 1 of login: validate credentials, handle lockout, and if
// credentials are correct, kick off MFA (this project only ever enables
// Authenticator-App-at-registration, but per the "Choose Method" screen
// decision noted above, login MFA is done via Email OTP - a separate,
// simpler channel from whatever MFA method was set up, which keeps this
// project's two MFA concepts - TOTP for registration, OTP for login -
// cleanly independent rather than tangled together).
const loginUser = async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!isValid(emailOrUsername)) {
      return res.status(400).json({ msg: "Email is Required" });
    }
    if (!isValid(password)) {
      return res.status(400).json({ msg: "Password is Required" });
    }

    // This project only ever stores an email, never a separate
    // username - so "emailOrUsername" is looked up as an email only.
    // Flagging this as a simplification: a real "username OR email"
    // login would need a second lookup index.
    const user = userStore.findUserByEmail(emailOrUsername);

    // Same generic message whether the email doesn't exist or the
    // password is wrong - never reveal which one was incorrect, so an
    // attacker can't use this endpoint to discover which emails are
    // registered.
    const invalidCredentialsResponse = () =>
      res.status(401).json({ msg: "Invalid email or password. Please try again." });

    if (!user) {
      return invalidCredentialsResponse();
    }

    if (user.lockUntil && Date.now() < user.lockUntil) {
      return res.status(423).json({
        msg: "Too many failed attempts. Please try again later.",
        accountLocked: true,
        lockUntil: user.lockUntil,
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      const updated = userStore.incrementFailedLoginAttempts(user.id);

      if (updated.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        const lockUntil = Date.now() + LOCKOUT_DURATION_MS;
        userStore.lockAccount(user.id, lockUntil);
        return res.status(423).json({
          msg: "Too many failed attempts. Your account has been locked for 15 minutes.",
          accountLocked: true,
          lockUntil,
        });
      }

      return invalidCredentialsResponse();
    }

    // Correct password - reset the failed-attempt counter and lockout.
    userStore.resetFailedLoginAttempts(user.id);

    if (user.mfaEnabled) {
      const challenge = await otpService.createOtpChallenge(user.id, "email");
      return res.status(200).json({
        msg: "MFA required",
        mfaRequired: true,
        method: "email",
        userId: user.id,
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
      });
    }

    // No MFA enabled (shouldn't normally happen, since this project's
    // registration flow always enables it) - log the user straight in.
    const session = sessionStore.createSession(user.id);
    res.cookie("sid", session.sessionId, getSessionCookieOptions());
    return res.status(200).json({ msg: "Login successful", mfaRequired: false });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

// POST /api/verify-login-otp
// Step 2 of login: verify the email OTP generated in loginUser, and on
// success, create the actual authenticated session. Reuses the exact
// same otpService challenge model as registration's email/SMS OTP -
// this is the same "6-digit code, hashed, expiring, attempt-limited"
// concept, just triggered by a login instead of a registration step.
const verifyLoginOtp = async (req, res) => {
  try {
    const { challengeId, code } = req.body;

    if (!isValid(challengeId)) {
      return res.status(400).json({ msg: "challengeId is Required" });
    }
    if (!isValid(code)) {
      return res.status(400).json({ msg: "code is Required" });
    }

    const result = await otpService.verifyOtpChallenge(challengeId, code);

    switch (result.status) {
      case "not_found":
        return res.status(404).json({ msg: "Challenge Not Found" });

      case "already_used":
        return res.status(400).json({ msg: "This code has already been used" });

      case "expired":
        return res.status(400).json({ msg: "Code expired.", codeExpired: true });

      case "max_attempts_reached":
        return res.status(429).json({
          msg: "Maximum attempts reached. Please request a new code.",
          maxAttemptsReached: true,
        });

      case "wrong":
        return res.status(400).json({
          msg: "Incorrect code. Please try again.",
          attemptsRemaining: result.attemptsRemaining,
        });

      case "success": {
        const session = sessionStore.createSession(result.userId);
        res.cookie("sid", session.sessionId, getSessionCookieOptions());
        return res.status(200).json({ msg: "Login successful", nextStep: "dashboard" });
      }

      default:
        return res.status(500).json({ msg: "Internal Server Error" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

// GET /api/me
// Protected by requireSession - by the time this runs, req.userId is
// already set (or the request never got this far). Only ever returns
// safe fields, never passwordHash or mfaSecret.
const getMe = (req, res) => {
  const user = userStore.findUserById(req.userId);

  if (!user) {
    return res.status(404).json({ msg: "User Not Found" });
  }

  return res.status(200).json({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    mobile: user.mobile,
    emailVerified: user.emailVerified,
    mobileVerified: user.mobileVerified,
    mfaEnabled: user.mfaEnabled,
  });
};

// POST /api/logout
const logout = (req, res) => {
  const sessionId = req.cookies && req.cookies.sid;

  if (sessionId) {
    sessionStore.deleteSession(sessionId);
  }

  res.clearCookie("sid", getSessionCookieOptions());
  return res.status(200).json({ msg: "Logged out successfully" });
};

// POST /api/token
// A DELIBERATELY SEPARATE flow from the session-based login above - it
// re-validates credentials independently (it does not reuse or require
// an existing session) and issues a short-lived JWT instead of a
// cookie. This exists purely to demonstrate JWT issuance/verification
// as its own mechanism, per the guidelines - a real app would pick one
// primary auth strategy, not run both side by side like this.
const issueToken = async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!isValid(emailOrUsername) || !isValid(password)) {
      return res.status(400).json({ msg: "Email and password are required" });
    }

    const user = userStore.findUserByEmail(emailOrUsername);
    if (!user) {
      return res.status(401).json({ msg: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ msg: "Invalid email or password" });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return res.status(200).json({ msg: "Token issued", token, expiresIn: JWT_EXPIRES_IN });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
};

// GET /api/protected
// Protected by requireJwt instead of requireSession - proves the server
// actually validates the JWT (wrong/expired/missing token all get
// rejected by the middleware before this function ever runs).
const getProtectedResource = (req, res) => {
  const user = userStore.findUserById(req.userId);

  if (!user) {
    return res.status(404).json({ msg: "User Not Found" });
  }

  return res.status(200).json({
    msg: "Access granted - this response required a valid JWT",
    user: { id: user.id, email: user.email },
  });
};


// Test-only endpoint so an evaluator (or the developer) can retrieve a
// simulated OTP without reading server console logs. Gated so it can
// never accidentally run in a real production environment - see
// routes/authRoute.js for the guard.
const getDevLastOtp = (req, res) => {
  const { challengeId } = req.query;

  if (!isValid(challengeId)) {
    return res.status(400).json({ msg: "challengeId query param is Required" });
  }

  const otp = otpService.getDevOnlyPlainOtp(challengeId);

  if (!otp) {
    return res.status(404).json({ msg: "No OTP found for this challengeId" });
  }

  return res.status(200).json({ challengeId, otp });
};

module.exports = {
  registerUser,
  sendEmailOtp,
  verifyEmailOtp,
  sendSmsOtp,
  verifySmsOtp,
  changeMobile,
  setupMfa,
  verifyMfa,
  loginUser,
  verifyLoginOtp,
  getMe,
  logout,
  issueToken,
  getProtectedResource,
  getDevLastOtp,
};
