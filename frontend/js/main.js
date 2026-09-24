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

  document.getElementById("login-link").addEventListener("click", (event) => {
    event.preventDefault();
    showScreen("screen-login");
  });

  setupEmailOtpScreen();
  setupSmsOtpScreen();
  setupMfaScreens();
  setupLoginScreens();
});

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((section) => {
    section.classList.remove("active");
  });
  document.getElementById(screenId).classList.add("active");
  updateStepIndicator(screenId);
}

// Desktop-only step indicator (hidden entirely on mobile via CSS). Maps
// each screen to a step number 1-4; Register and Success show no
// stepper at all, matching the WEB reference screenshots.
const STEP_INDICATOR_MAP = {
  "screen-register": null,
  "screen-email-otp": 2,
  "screen-sms-otp": 3,
  "screen-mfa-setup": 4,
  "screen-mfa-qr": 4,
  "screen-mfa-verify": 4,
  "screen-success": null,
  // Login screens have their own distinct desktop design in the
  // reference (not the registration stepper flow at all), so they never
  // show this indicator.
  "screen-login": null,
  "screen-choose-method": null,
  "screen-login-otp": null,
};

function updateStepIndicator(screenId) {
  const indicator = document.getElementById("step-indicator");
  const activeStep = STEP_INDICATOR_MAP[screenId];

  if (activeStep === null || activeStep === undefined) {
    indicator.classList.add("hidden");
    return;
  }

  indicator.classList.remove("hidden");

  document.querySelectorAll(".step-dot").forEach((dot) => {
    const stepNumber = Number(dot.dataset.step);
    dot.classList.remove("active", "completed");
    if (stepNumber === activeStep) {
      dot.classList.add("active");
    } else if (stepNumber < activeStep) {
      dot.classList.add("completed");
    }
  });

  document.querySelectorAll(".step-line").forEach((line, index) => {
    // step-line[0] sits between dot 1 and dot 2, so it's "completed"
    // once we're past step 2, and so on.
    line.classList.toggle("completed", index + 2 <= activeStep);
  });
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
    clearOtpBoxes(boxes);
    boxes.forEach((box) => (box.disabled = true));
    return;
  }

  if (data.maxAttemptsReached) {
    // Distinct "locked" visual from "expired", matching the reference
    // screenshot's separate Max Attempts screen for Mobile OTP (email's
    // OTP flow still reuses "expired" for this case - see
    // PROJECT_CONTEXT.md for why that asymmetry is intentional).
    stopSmsOtpTimers();
    screen.dataset.state = "locked";
    errorEl.textContent = "Maximum attempts reached. Please request a new code.";
    errorEl.className = "otp-error";
    clearOtpBoxes(boxes);
    boxes.forEach((box) => (box.disabled = true));
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

  // Desktop-only Back/Continue pair does exactly the same two things as
  // the mobile arrow + single Continue button - reusing the same logic
  // rather than duplicating it.
  document.getElementById("mfa-qr-back-desktop").addEventListener("click", () => {
    showScreen("screen-mfa-setup");
  });

  document.getElementById("mfa-qr-continue-desktop").addEventListener("click", () => {
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
    showScreen("screen-login");
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

// ===================== PART 2: Login =====================

// Separate state from the registration flow's currentUser/currentChallengeId -
// login has its own userId (from the login response) and its own OTP
// challengeId, and mixing them with the registration flow's variables
// would make it unclear which flow is "active" at any given moment.
let loginUserId = null;
let loginChallengeId = null;

let loginOtpCountdownInterval = null;
let loginOtpResendCooldownInterval = null;

function setupLoginScreens() {
  setupPasswordVisibilityToggleFor("loginPassword", "toggle-login-password");

  document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);

  document.getElementById("create-account-link").addEventListener("click", (event) => {
    event.preventDefault();
    showScreen("screen-register");
  });

  // Forgot password and Google login are shown in the reference but
  // were never in scope for this assignment (no password-reset flow or
  // OAuth integration was requested) - clear placeholders rather than
  // silent no-ops, matching this project's established pattern.
  document.getElementById("forgot-password-link").addEventListener("click", (event) => {
    event.preventDefault();
    alert("Password reset isn't part of this build.");
  });

  document.getElementById("google-login-btn").addEventListener("click", () => {
    alert("Google sign-in isn't part of this build - only email/password + MFA login is implemented.");
  });

  document.getElementById("choose-method-back").addEventListener("click", () => {
    showScreen("screen-login");
  });

  document.getElementById("choose-method-continue").addEventListener("click", () => {
    // The email OTP challenge was already created back in handleLoginSubmit
    // (see loginUser() in authController.js) - choosing a method here
    // doesn't call the backend again, it just moves to the matching
    // screen. Only Email OTP is wired to a real challengeId, per the
    // same "show all options, implement one" pattern used for MFA setup.
    startLoginOtpFlow();
  });

  setupLoginOtpScreen();
}

// Generic show/hide toggle, parameterized so it can drive the login
// password field without duplicating passwordStrength.js's version
// (which is hardcoded to the registration form's #password field).
function setupPasswordVisibilityToggleFor(inputId, buttonId) {
  const input = document.getElementById(inputId);
  const button = document.getElementById(buttonId);

  button.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  });
}

function setLoginError(message) {
  const screen = document.getElementById("screen-login");
  const errorEl = document.getElementById("login-error");

  if (!message) {
    screen.dataset.state = "default";
    errorEl.textContent = "";
    errorEl.className = "otp-error";
    return;
  }

  screen.dataset.state = "invalid";
  errorEl.textContent = message;
  errorEl.className = "otp-error";
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  setLoginError(null);

  const emailOrUsername = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  if (!emailOrUsername.trim() || !password) {
    setLoginError("Please enter both your email and password.");
    return;
  }

  const submitButton = document.getElementById("login-submit-btn");
  submitButton.disabled = true;
  submitButton.textContent = "Logging in...";

  const result = await loginUser(emailOrUsername, password);

  submitButton.disabled = false;
  submitButton.textContent = "Login";

  if (!result.ok) {
    // Covers both plain "invalid credentials" (401) and "account locked"
    // (423) - both are shown the same way on this screen, since the
    // reference only shows one "Invalid Credentials" error state, not a
    // separate lockout screen.
    setLoginError(result.error);
    return;
  }

  if (result.data.mfaRequired) {
    loginUserId = result.data.userId;
    loginChallengeId = result.data.challengeId;
    // Store the challenge's expiresAt for startLoginOtpFlow to use.
    pendingLoginOtpExpiresAt = result.data.expiresAt;
    document.getElementById("login-form").reset();
    showScreen("screen-choose-method");
    return;
  }

  // mfaRequired: false - this project's registration flow always
  // enables MFA, so this branch is only reachable if that ever changes.
  // Handled anyway so login doesn't silently fail for such an account.
  alert("Login successful (no MFA on this account).");
}

let pendingLoginOtpExpiresAt = null;

function startLoginOtpFlow() {
  const screen = document.getElementById("screen-login-otp");
  screen.dataset.state = "default";

  document.getElementById("login-otp-destination").textContent =
    document.getElementById("loginEmail").value || "your email";
  document.getElementById("login-otp-error").textContent = "";
  document.getElementById("login-otp-error").className = "otp-error";

  const boxes = Array.from(document.querySelectorAll("#login-otp-boxes .otp-box"));
  clearOtpBoxes(boxes);
  boxes.forEach((box) => (box.disabled = false));

  showScreen("screen-login-otp");

  startLoginOtpCountdown(pendingLoginOtpExpiresAt);
  startLoginOtpResendCooldown();
}

function stopLoginOtpTimers() {
  clearInterval(loginOtpCountdownInterval);
  clearInterval(loginOtpResendCooldownInterval);
}

function startLoginOtpCountdown(expiresAt) {
  clearInterval(loginOtpCountdownInterval);

  const countdownEl = document.getElementById("login-otp-countdown");

  const tick = () => {
    const secondsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    countdownEl.textContent = formatMMSS(secondsLeft);

    if (secondsLeft <= 0) {
      clearInterval(loginOtpCountdownInterval);
      document.getElementById("screen-login-otp").dataset.state = "expired";
      const errorEl = document.getElementById("login-otp-error");
      errorEl.textContent = "Code expired.";
      errorEl.className = "otp-error";
      const boxes = Array.from(document.querySelectorAll("#login-otp-boxes .otp-box"));
      clearOtpBoxes(boxes);
    }
  };

  tick();
  loginOtpCountdownInterval = setInterval(tick, 1000);
}

function startLoginOtpResendCooldown() {
  clearInterval(loginOtpResendCooldownInterval);

  const link = document.getElementById("login-otp-resend-link");
  const countdownSpan = document.getElementById("login-otp-resend-countdown");

  let secondsLeft = RESEND_COOLDOWN_SECONDS;
  link.classList.add("disabled");

  const tick = () => {
    if (secondsLeft <= 0) {
      clearInterval(loginOtpResendCooldownInterval);
      countdownSpan.textContent = "";
      link.classList.remove("disabled");
      return;
    }
    countdownSpan.textContent = `(${formatMMSS(secondsLeft)})`;
    secondsLeft -= 1;
  };

  tick();
  loginOtpResendCooldownInterval = setInterval(tick, 1000);
}

function setupLoginOtpScreen() {
  const boxes = Array.from(document.querySelectorAll("#login-otp-boxes .otp-box"));

  // These boxes are readonly (see index.html) - the keypad below is the
  // only way to type into them, so there's no setupOtpBoxAutoAdvance()
  // call here the way email/sms/mfa-verify screens use it. Instead, the
  // keypad buttons directly write into whichever box is next-empty.
  document.querySelectorAll("#login-otp-keypad .keypad-btn[data-digit]").forEach((button) => {
    button.addEventListener("click", () => {
      const digit = button.dataset.digit;
      const nextEmptyBox = boxes.find((box) => box.value === "");
      if (!nextEmptyBox) return;

      nextEmptyBox.value = digit;

      const code = getOtpValue(boxes);
      if (code.length === 6) {
        handleLoginOtpVerify(code);
      }
    });
  });

  document.getElementById("login-otp-backspace").addEventListener("click", () => {
    // Delete from the last FILLED box, not just the last box in the
    // array - mirrors how a real keypad backspace behaves.
    for (let i = boxes.length - 1; i >= 0; i -= 1) {
      if (boxes[i].value !== "") {
        boxes[i].value = "";
        break;
      }
    }
  });

  document.getElementById("login-otp-back").addEventListener("click", () => {
    stopLoginOtpTimers();
    showScreen("screen-choose-method");
  });

  document.getElementById("login-otp-resend-link").addEventListener("click", (event) => {
    event.preventDefault();
    handleLoginOtpResend();
  });

  document.getElementById("login-otp-didnt-receive").addEventListener("click", (event) => {
    event.preventDefault();
    handleLoginOtpResend();
  });
}

async function handleLoginOtpVerify(code) {
  const result = await verifyLoginOtp(loginChallengeId, code);
  const screen = document.getElementById("screen-login-otp");
  const errorEl = document.getElementById("login-otp-error");
  const boxes = Array.from(document.querySelectorAll("#login-otp-boxes .otp-box"));

  if (result.ok) {
    stopLoginOtpTimers();
    // A real "authenticated application/dashboard" screen is out of
    // scope for this assignment (the guidelines only ask us to
    // demonstrate that a session gets created) - fetchMe() proves the
    // session cookie actually works end-to-end, then we show a simple
    // confirmation rather than building a full dashboard UI.
    const me = await fetchMe();
    if (me.ok) {
      alert(`Login successful! Session confirmed via GET /api/me as: ${me.data.email}`);
    } else {
      alert("Login succeeded, but GET /api/me failed - check the console/network tab.");
    }
    return;
  }

  const data = result.data || {};

  if (data.codeExpired) {
    stopLoginOtpTimers();
    screen.dataset.state = "expired";
    errorEl.textContent = "Code expired.";
    errorEl.className = "otp-error";
    clearOtpBoxes(boxes);
    return;
  }

  if (data.maxAttemptsReached) {
    stopLoginOtpTimers();
    screen.dataset.state = "expired";
    errorEl.textContent = "Maximum attempts reached. Please request a new code.";
    errorEl.className = "otp-error";
    clearOtpBoxes(boxes);
    boxes.forEach((box) => (box.disabled = true));
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

async function handleLoginOtpResend() {
  // Reuses the exact same /api/send-email-otp endpoint the registration
  // flow uses - it only ever needed a userId, and was never actually
  // tied to "registration" specifically, so no new backend endpoint was
  // needed here.
  const result = await sendEmailOtp(loginUserId);

  if (!result.ok) {
    document.getElementById("login-otp-error").textContent = result.error;
    return;
  }

  loginChallengeId = result.data.challengeId;
  pendingLoginOtpExpiresAt = result.data.expiresAt;
  startLoginOtpFlow();
}
