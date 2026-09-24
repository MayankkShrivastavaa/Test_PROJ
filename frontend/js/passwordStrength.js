// This file checks the password against the same four rules the backend
// checks, and updates the checklist UI live as the user types.
//
// IMPORTANT: this is a UX convenience only. The backend re-checks the
// password independently and will reject a weak password even if this
// script is disabled, bypassed, or never runs (e.g. JS turned off,
// or someone calls the API directly with a tool like curl/Postman).

// Runs the same four checks as backend/utils/validators.js's
// checkPasswordStrength(). Keeping the frontend and backend rules
// identical (even if duplicated) means the checklist never lies about
// what the backend will actually accept.
function checkPasswordStrength(password) {
  const rules = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[^A-Za-z0-9]/.test(password),
  };

  const isStrongEnough =
    rules.minLength &&
    rules.hasUppercase &&
    rules.hasNumber &&
    rules.hasSpecialChar;

  return { ...rules, isStrongEnough };
}

function updatePasswordChecklist(password) {
  const strength = checkPasswordStrength(password);

  // For each rule (minLength, hasUppercase, ...), find its <li> by id
  // and toggle the "rule-met" class, which the CSS uses to turn the
  // checkmark green.
  Object.keys(strength).forEach((ruleName) => {
    if (ruleName === "isStrongEnough") return; // not a checklist item

    const listItem = document.getElementById(`rule-${ruleName}`);
    if (!listItem) return;

    listItem.classList.toggle("rule-met", strength[ruleName]);
  });

  return strength;
}

function setupPasswordVisibilityToggle() {
  const passwordInput = document.getElementById("password");
  const toggleButton = document.getElementById("toggle-password");

  toggleButton.addEventListener("click", () => {
    const isCurrentlyHidden = passwordInput.type === "password";
    passwordInput.type = isCurrentlyHidden ? "text" : "password";
    toggleButton.setAttribute(
      "aria-label",
      isCurrentlyHidden ? "Hide password" : "Show password"
    );
  });
}

function setupPasswordChecklist() {
  const passwordInput = document.getElementById("password");

  passwordInput.addEventListener("input", () => {
    updatePasswordChecklist(passwordInput.value);
  });
}
