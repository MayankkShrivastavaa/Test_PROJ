// This file wires all screens together. It reads forms, validates them
// on the client (fast feedback only), calls the API, and decides which
// screen to show next based on the backend's response.

// --- Simple in-memory flow state (lost on page refresh - that's fine,
// this mirrors how the backend also can't remember anything across a
// full server restart in Phase 1/2) ---
let currentUser = null;
let currentChallengeId = null;

let emailOtpCountdownInterval = null;
let emailOtpResendCooldownInterval = null;

let smsOtpCountdownInterval = null;
let smsOtpResendCooldownInterval = null;

const RESEND_COOLDOWN_SECONDS = 25;

document.addEventListener("DOMContentLoaded", () => {
  setupPasswordVisibilityToggle();
  setupPasswordChecklist();

  document
    .getElementById("register-form")
    .addEventListener("submit", handleRegisterSubmit);

  setupEmailOtpScreen();
  setupSmsOtpScreen();
  setupMfaScreens();
});

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((section) => {
    section.classList.remove("active");
  });
  document.getElementById(screenId).classList.add("active");
}

// ===================== Registration screen =====================

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach((el) => {
    el.textContent = "";
  });
  document.querySelectorAll("input").forEach((el) => {
    el.classList.remove("input-invalid");
  });
}

function showFieldError(fieldName, message) {
  const errorEl = document.getElementById(`error-${fieldName}`);
  const inputEl = document.getElementById(fieldName);

  if (errorEl) errorEl.textContent = message;
  if (inputEl) inputEl.classList.add("input-invalid");
}

function setFormStatus(message, type) {
  const statusEl = document.getElementById("form-status");
  statusEl.textContent = message;
  statusEl.className = "form-status";
  if (type) statusEl.classList.add(`status-${type}`);
}

function validateRegisterForm(values) {
  let isValid = true;

  if (!values.fullName.trim()) {
    showFieldError("fullName", "Full name is required");
    isValid = false;
  } else if (!/^[a-zA-Z ]{2,}$/.test(values.fullName.trim())) {
    showFieldError("fullName", "Enter a valid full name");
    isValid = false;
  }

  if (!values.email.trim()) {
    showFieldError("email", "Email is required");
    isValid = false;
  } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(values.email)) {
    showFieldError("email", "Enter a valid email address");
    isValid = false;
  }

  if (!values.mobile.trim()) {
    showFieldError("mobile", "Mobile number is required");
    isValid = false;
  } else if (!/^\d{7,15}$/.test(values.mobile.trim())) {
    showFieldError("mobile", "Enter a valid mobile number");
    isValid = false;
  }

  const strength = checkPasswordStrength(values.password);
  if (!strength.isStrongEnough) {
    setFormStatus("Password does not meet the minimum requirements.", "error");
    isValid = false;
  }

  if (!values.termsAccepted) {
    showFieldError("terms", "You must agree to the Terms & Conditions");
    isValid = false;
  }

  return isValid;
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  clearFieldErrors();
  setFormStatus("", null);

  const values = {
    fullName: document.getElementById("fullName").value,
    email: document.getElementById("email").value,
    countryCode: document.getElementById("countryCode").value,
    mobile: document.getElementById("mobile").value,
    password: document.getElementById("password").value,
    termsAccepted: document.getElementById("terms").checked,
  };

  if (!validateRegisterForm(values)) {
    return;
  }

  const submitButton = document.getElementById("submit-btn");
  submitButton.disabled = true;
  submitButton.textContent = "Creating account...";

  const result = await registerUser({
    fullName: values.fullName,
    email: values.email,
    countryCode: values.countryCode,
    mobile: values.mobile,
    password: values.password,
  });

  submitButton.disabled = false;
  submitButton.textContent = "Create Account";

  if (!result.ok) {
    setFormStatus(result.error, "error");
    return;
  }

  currentUser = result.data.user;
  currentChallengeId = result.data.challengeId;

  startEmailOtpFlow(result.data.expiresAt);
}

// ===================== Email OTP screen =====================

function setupEmailOtpScreen() {
  const boxes = Array.from(document.querySelectorAll("#email-otp-boxes .otp-box"));

  setupOtpBoxAutoAdvance(boxes);

  boxes.forEach((box) => {
    box.addEventListener("input", () => {
      const code = getOtpValue(boxes);
      if (code.length === 6) {
        handleEmailOtpVerify(code);
      }
    });
  });

  document.getElementById("email-otp-back").addEventListener("click", () => {
    stopEmailOtpTimers();
    showScreen("screen-register");
  });

  document.getElementById("email-otp-resend-link").addEventListener("click", (event) => {
    event.preventDefault();
    handleEmailOtpResend();
  });

  document.getElementById("email-otp-didnt-receive").addEventListener("click", (event) => {
    event.preventDefault();
    handleEmailOtpResend();
  });

  document.getElementById("email-otp-resend-btn").addEventListener("click", () => {
    handleEmailOtpResend();
  });
}

function startEmailOtpFlow(expiresAt) {
  const screen = document.getElementById("screen-email-otp");
  screen.dataset.state = "default";

  document.getElementById("email-otp-destination").textContent = currentUser.email;
  document.getElementById("email-otp-error").textContent = "";
  document.getElementById("email-otp-error").className = "otp-error";

  const boxes = Array.from(document.querySelectorAll("#email-otp-boxes .otp-box"));
  clearOtpBoxes(boxes);
  boxes.forEach((box) => (box.disabled = false));

  showScreen("screen-email-otp");

  startEmailOtpCountdown(expiresAt);
  startResendCooldown();
}

function stopEmailOtpTimers() {
  clearInterval(emailOtpCountdownInterval);
  clearInterval(emailOtpResendCooldownInterval);
}

function formatMMSS(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function startEmailOtpCountdown(expiresAt) {
  clearInterval(emailOtpCountdownInterval);

  const countdownEl = document.getElementById("email-otp-countdown");

  const tick = () => {
    const secondsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    countdownEl.textContent = formatMMSS(secondsLeft);

    if (secondsLeft <= 0) {
      clearInterval(emailOtpCountdownInterval);
      document.getElementById("screen-email-otp").dataset.state = "expired";
      document.getElementById("email-otp-error").textContent = "This code has expired.";
      document.getElementById("email-otp-error").className = "otp-error";
    }
  };

  tick();
  emailOtpCountdownInterval = setInterval(tick, 1000);
}

function startResendCooldown() {
  clearInterval(emailOtpResendCooldownInterval);

  const link = document.getElementById("email-otp-resend-link");
  const countdownSpan = document.getElementById("email-otp-resend-countdown");

  let secondsLeft = RESEND_COOLDOWN_SECONDS;
  link.classList.add("disabled");

  const tick = () => {
    if (secondsLeft <= 0) {
      clearInterval(emailOtpResendCooldownInterval);
      countdownSpan.textContent = "";
      link.classList.remove("disabled");
      return;
    }
    countdownSpan.textContent = `(${formatMMSS(secondsLeft)})`;
    secondsLeft -= 1;
  };

  tick();
  emailOtpResendCooldownInterval = setInterval(tick, 1000);
}

async function handleEmailOtpVerify(code) {
  const result = await verifyEmailOtp(currentChallengeId, code);
  const screen = document.getElementById("screen-email-otp");
  const errorEl = document.getElementById("email-otp-error");
  const boxes = Array.from(document.querySelectorAll("#email-otp-boxes .otp-box"));

  if (result.ok) {
    // Email verified. The backend already generated an SMS OTP challenge
    // for us (see authController.js verifyEmailOtp) - move straight into
    // the Mobile OTP screen using it.
    stopEmailOtpTimers();
    currentChallengeId = result.data.challengeId;
    startSmsOtpFlow(result.data.mobile, result.data.expiresAt);
    return;
  }

  const data = result.data || {};

  if (data.codeExpired) {
    stopEmailOtpTimers();
    screen.dataset.state = "expired";
    errorEl.textContent = "This code has expired.";
    errorEl.className = "otp-error";
    return;
  }

  if (data.maxAttemptsReached) {
    stopEmailOtpTimers();
    screen.dataset.state = "expired";
    errorEl.textContent = "Maximum attempts reached. Please request a new code.";
    errorEl.className = "otp-error";
    return;
  }

  screen.dataset.state = "wrong";
  const attemptsRemaining = data.attemptsRemaining;
  errorEl.textContent =
    attemptsRemaining !== undefined
      ? `Incorrect code. Please try again. You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} left.`
      : "Incorrect code. Please try again.";
  errorEl.className = "otp-error";

  clearOtpBoxes(boxes);
}

async function handleEmailOtpResend() {
  const result = await sendEmailOtp(currentUser.id);

  if (!result.ok) {
    document.getElementById("email-otp-error").textContent = result.error;
    return;
  }

  currentChallengeId = result.data.challengeId;
  startEmailOtpFlow(result.data.expiresAt);
}

// ===================== Mobile OTP screen =====================
// Mirrors the Email OTP screen closely (same countdown/resend pattern),
// with two differences the reference screenshots call for: a distinct
// "locked" look when attempts run out or the code expires (email reuses
// the same "expired" state for both cases too, so no new CSS was
// needed), and a "Wrong number? Change" mini-form.

function setupSmsOtpScreen() {
  const boxes = Array.from(document.querySelectorAll("#sms-otp-boxes .otp-box"));

  setupOtpBoxAutoAdvance(boxes);

  boxes.forEach((box) => {
    box.addEventListener("input", () => {
      const code = getOtpValue(boxes);
      if (code.length === 6) {
        handleSmsOtpVerify(code);
      }
    });
  });

  document.getElementById("sms-otp-back").addEventListener("click", () => {
    stopSmsOtpTimers();
    showScreen("screen-email-otp");
  });

  document.getElementById("sms-otp-resend-link").addEventListener("click", (event) => {
    event.preventDefault();
    handleSmsOtpResend();
  });

  document.getElementById("sms-otp-resend-btn").addEventListener("click", () => {
    handleSmsOtpResend();
  });

  document.getElementById("sms-otp-change-link").addEventListener("click", (event) => {
    event.preventDefault();
    const form = document.getElementById("mobile-change-form");
    form.hidden = !form.hidden;
  });

  document.getElementById("mobile-change-submit").addEventListener("click", handleMobileChangeSubmit);
}

function startSmsOtpFlow(mobile, expiresAt) {
  const screen = document.getElementById("screen-sms-otp");
  screen.dataset.state = "default";

  document.getElementById("sms-otp-destination").textContent = mobile;
  document.getElementById("sms-otp-error").textContent = "";
  document.getElementById("sms-otp-error").className = "otp-error";

  document.getElementById("mobile-change-form").hidden = true;
  document.getElementById("error-new-mobile").textContent = "";

  const boxes = Array.from(document.querySelectorAll("#sms-otp-boxes .otp-box"));
  clearOtpBoxes(boxes);
  boxes.forEach((box) => (box.disabled = false));

  showScreen("screen-sms-otp");

  startSmsOtpCountdown(expiresAt);
  startSmsResendCooldown();
}

function stopSmsOtpTimers() {
  clearInterval(smsOtpCountdownInterval);
  clearInterval(smsOtpResendCooldownInterval);
}

function startSmsOtpCountdown(expiresAt) {
  clearInterval(smsOtpCountdownInterval);

  const countdownEl = document.getElementById("sms-otp-countdown");

  const tick = () => {
    const secondsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    countdownEl.textContent = formatMMSS(secondsLeft);

    if (secondsLeft <= 0) {
      clearInterval(smsOtpCountdownInterval);
      document.getElementById("screen-sms-otp").dataset.state = "expired";
      document.getElementById("sms-otp-error").textContent = "This code has expired.";
      document.getElementById("sms-otp-error").className = "otp-error";
    }
  };

  tick();
  smsOtpCountdownInterval = setInterval(tick, 1000);
}

function startSmsResendCooldown() {
  clearInterval(smsOtpResendCooldownInterval);

  const link = document.getElementById("sms-otp-resend-link");
  const countdownSpan = document.getElementById("sms-otp-resend-countdown");

  let secondsLeft = RESEND_COOLDOWN_SECONDS;
  link.classList.add("disabled");

  const tick = () => {
    if (secondsLeft <= 0) {
      clearInterval(smsOtpResendCooldownInterval);
      countdownSpan.textContent = "";
      link.classList.remove("disabled");
      return;
    }
    countdownSpan.textContent = `(${formatMMSS(secondsLeft)})`;
    secondsLeft -= 1;
  };

  tick();
  smsOtpResendCooldownInterval = setInterval(tick, 1000);
}

async function handleSmsOtpVerify(code) {
  const result = await verifySmsOtp(currentChallengeId, code);
  const screen = document.getElementById("screen-sms-otp");
  const errorEl = document.getElementById("sms-otp-error");
  const boxes = Array.from(document.querySelectorAll("#sms-otp-boxes .otp-box"));

  if (result.ok) {
    // Mobile verified. Move straight into MFA setup - the backend
    // already told us nextStep is "mfa-setup", and our own
    // startMfaSetupFlow() calls /api/mfa/setup to get the QR code.
    stopSmsOtpTimers();
    startMfaSetupFlow();
    return;
  }

  const data = result.data || {};

  if (data.codeExpired) {
    stopSmsOtpTimers();
    screen.dataset.state = "expired";
    errorEl.textContent = "This code has expired.";
    errorEl.className = "otp-error";
    return;
  }

  if (data.maxAttemptsReached) {
    stopSmsOtpTimers();
    screen.dataset.state = "expired"; // same locked visual as expired
    errorEl.textContent = "Maximum attempts reached. Please request a new code.";
    errorEl.className = "otp-error";
    return;
  }

  screen.dataset.state = "wrong";
  const attemptsRemaining = data.attemptsRemaining;
  errorEl.textContent =
    attemptsRemaining !== undefined
      ? `Incorrect code. Please try again. You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} left.`
      : "Incorrect code. Please try again.";
  errorEl.className = "otp-error";

  clearOtpBoxes(boxes);
}

async function handleSmsOtpResend() {
  const result = await sendSmsOtp(currentUser.id);

  if (!result.ok) {
    document.getElementById("sms-otp-error").textContent = result.error;
    return;
  }

  currentChallengeId = result.data.challengeId;
  startSmsOtpFlow(currentUser.mobile, result.data.expiresAt);
}

async function handleMobileChangeSubmit() {
  const countryCode = document.getElementById("new-countryCode").value;
  const mobile = document.getElementById("new-mobile").value;
  const errorEl = document.getElementById("error-new-mobile");

  errorEl.textContent = "";

  if (!mobile.trim() || !/^\d{7,15}$/.test(mobile.trim())) {
    errorEl.textContent = "Enter a valid mobile number";
    return;
  }

  const result = await changeMobile(currentUser.id, countryCode, mobile);

  if (!result.ok) {
    errorEl.textContent = result.error;
    return;
  }

  // Keep our local copy of the user in sync with the backend's update,
  // since later screens (and a future resend) read currentUser.mobile.
  currentUser.mobile = result.data.mobile;
  currentChallengeId = result.data.challengeId;

  startSmsOtpFlow(result.data.mobile, result.data.expiresAt);
}

// ===================== MFA screens =====================
// Three screens: method selection (Set Up MFA), QR display
// (Authenticator Setup), and code entry (MFA Verification). Unlike the
// email/sms OTP screens, there's no countdown timer here that expires a
// challenge - TOTP codes just keep rotating every 30 seconds for as long
// as the secret exists. See backend/services/mfaService.js for why this
// verification model is fundamentally different from OTP challenges.

function setupMfaScreens() {
  document.getElementById("mfa-setup-back").addEventListener("click", () => {
    showScreen("screen-sms-otp");
  });

  document.getElementById("mfa-setup-continue").addEventListener("click", handleMfaSetupContinue);

  document.getElementById("mfa-qr-back").addEventListener("click", () => {
    showScreen("screen-mfa-setup");
  });

  document.getElementById("mfa-qr-enter-key-link").addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("setup-key-box").hidden = false;
  });

  document.getElementById("mfa-qr-continue").addEventListener("click", () => {
    showScreen("screen-mfa-verify");
    const boxes = Array.from(document.querySelectorAll("#mfa-verify-boxes .otp-box"));
    clearOtpBoxes(boxes);
  });

  const mfaBoxes = Array.from(document.querySelectorAll("#mfa-verify-boxes .otp-box"));
  setupOtpBoxAutoAdvance(mfaBoxes);
  mfaBoxes.forEach((box) => {
    box.addEventListener("input", () => {
      const code = getOtpValue(mfaBoxes);
      if (code.length === 6) {
        handleMfaVerify(code);
      }
    });
  });

  document.getElementById("mfa-verify-back").addEventListener("click", () => {
    showScreen("screen-mfa-qr");
  });

  // "Can't access your app?" - the reference screenshots show this link
  // but the assignment doesn't call for backup/recovery codes, so this
  // is informational only rather than wired to a real recovery flow.
  document.getElementById("mfa-cant-access-link").addEventListener("click", (event) => {
    event.preventDefault();
    const errorEl = document.getElementById("mfa-verify-error");
    errorEl.textContent =
      "Backup recovery codes aren't part of this build yet - please use the authenticator app you just set up.";
    errorEl.className = "otp-error";
  });

  document.getElementById("continue-to-login").addEventListener("click", () => {
    // Login itself is a separate phase (Part 2) and doesn't exist yet -
    // this is a clearly-labeled placeholder rather than a dead link that
    // silently does nothing.
    alert("Login screen isn't built yet - that's the next phase after this one.");
  });
}

function startMfaSetupFlow() {
  document.getElementById("mfa-setup-error").textContent = "";
  showScreen("screen-mfa-setup");
}

async function handleMfaSetupContinue() {
  const button = document.getElementById("mfa-setup-continue");
  const errorEl = document.getElementById("mfa-setup-error");

  button.disabled = true;
  button.textContent = "Setting up...";

  const result = await setupMfa(currentUser.id);

  button.disabled = false;
  button.textContent = "Continue";

  if (!result.ok) {
    errorEl.textContent = result.error;
    return;
  }

  document.getElementById("mfa-qr-image").src = result.data.qrCodeDataUrl;
  document.getElementById("setup-key-value").textContent = result.data.setupKey;
  document.getElementById("setup-key-box").hidden = true;

  showScreen("screen-mfa-qr");
}

async function handleMfaVerify(code) {
  const result = await verifyMfa(currentUser.id, code);
  const screen = document.getElementById("screen-mfa-verify");
  const errorEl = document.getElementById("mfa-verify-error");
  const boxes = Array.from(document.querySelectorAll("#mfa-verify-boxes .otp-box"));

  if (result.ok) {
    showSuccessScreen();
    return;
  }

  screen.dataset.state = "wrong";
  errorEl.textContent = result.data?.invalidCode
    ? "Invalid code. Please try again."
    : result.error;
  errorEl.className = "otp-error";

  clearOtpBoxes(boxes);
}

// ===================== Registration Success screen =====================

function showSuccessScreen() {
  // currentUser was last updated after registration and doesn't reflect
  // emailVerified/mobileVerified/mfaEnabled changes made along the way,
  // but by this point in the flow all three are guaranteed true (the
  // user could not have reached this screen otherwise) - so the
  // checklist doesn't need to re-fetch anything from the backend.
  showScreen("screen-success");
}
