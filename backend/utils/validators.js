// Small, reusable validation helpers.
// Each function checks ONE thing and returns true/false.
// Controllers call these instead of writing regex/if-checks inline.

const isValid = (input) => {
  if (typeof input === "undefined" || input === null) return false;
  if (typeof input === "string" && input.trim().length === 0) return false;
  return true;
};

const isValidFullName = (input) => /^[a-zA-Z ]{2,}$/.test(input.trim());

const isValidEmail = (input) =>
  /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(input);

// Basic check: 7 to 15 digits (mobile number without the country code).
const isValidMobile = (input) => /^\d{7,15}$/.test(input);

// Checks the password against each rule from the Registration screen's
// checklist. Returns an object so both the backend (to accept/reject
// registration) and the frontend (to show live checkmarks) can use the
// exact same rules and never disagree with each other.
const checkPasswordStrength = (password) => {
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
};

module.exports = {
  isValid,
  isValidFullName,
  isValidEmail,
  isValidMobile,
  checkPasswordStrength,
};
