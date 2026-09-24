const express = require("express");
const router = express.Router();

<<<<<<< HEAD
const requireSession = require("../middlewares/requireSession");
const requireJwt = require("../middlewares/requireJwt");

=======
>>>>>>> origin/main
const {
  registerUser,
  sendEmailOtp,
  verifyEmailOtp,
  sendSmsOtp,
  verifySmsOtp,
  changeMobile,
  setupMfa,
  verifyMfa,
<<<<<<< HEAD
  loginUser,
  verifyLoginOtp,
  getMe,
  logout,
  issueToken,
  getProtectedResource,
=======
>>>>>>> origin/main
  getDevLastOtp,
} = require("../controllers/authController");

router.post("/register", registerUser);

router.post("/send-email-otp", sendEmailOtp);
router.post("/verify-email-otp", verifyEmailOtp);

router.post("/send-sms-otp", sendSmsOtp);
router.post("/verify-sms-otp", verifySmsOtp);
router.post("/change-mobile", changeMobile);

router.post("/mfa/setup", setupMfa);
router.post("/mfa/verify", verifyMfa);

<<<<<<< HEAD
// --- Part 2: Login, sessions, JWT ---
router.post("/login", loginUser);
router.post("/verify-login-otp", verifyLoginOtp);

// Session-based auth: requireSession reads the "sid" cookie.
router.get("/me", requireSession, getMe);
router.post("/logout", logout);

// JWT-based auth: a deliberately separate flow from the session one
// above - requireJwt reads an Authorization: Bearer header instead.
router.post("/token", issueToken);
router.get("/protected", requireJwt, getProtectedResource);

=======
>>>>>>> origin/main
// This endpoint only exists to make evaluator testing possible without
// reading server console logs, per the assignment's guidelines. It is
// wired up ONLY when NODE_ENV is not "production", so it can never be
// reachable on a real deployed environment by accident.
if (process.env.NODE_ENV !== "production") {
  router.get("/dev/last-otp", getDevLastOtp);
}

module.exports = router;
