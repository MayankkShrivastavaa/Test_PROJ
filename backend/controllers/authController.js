const bcrypt = require("bcryptjs");

const userStore = require("../store/userStore");
const otpService = require("../services/otpService");
const mfaService = require("../services/mfaService");
const {
  isValid,
  isValidFullName,
  isValidEmail,
  isValidMobile,
  checkPasswordStrength,
} = require("../utils/validators");

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
  getDevLastOtp,
};
