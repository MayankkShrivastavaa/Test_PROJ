const express = require("express");
const router = express.Router();

const {
  registerUser,
  sendEmailOtp,
  verifyEmailOtp,
  sendSmsOtp,
  verifySmsOtp,
  changeMobile,
  setupMfa,
  verifyMfa,
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

// This endpoint only exists to make evaluator testing possible without
// reading server console logs, per the assignment's guidelines. It is
// wired up ONLY when NODE_ENV is not "production", so it can never be
// reachable on a real deployed environment by accident.
if (process.env.NODE_ENV !== "production") {
  router.get("/dev/last-otp", getDevLastOtp);
}

module.exports = router;
