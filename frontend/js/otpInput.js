// Generic behavior for a row of 6 single-digit <input> boxes, used by the
// Email OTP screen (and, in later phases, SMS OTP and MFA verification
// too - that's why this logic lives in its own file instead of being
// copy-pasted).

// Wires up auto-advance-to-next-box and backspace-to-previous-box for a
// given array of input elements.
function setupOtpBoxAutoAdvance(inputElements) {
  inputElements.forEach((input, index) => {
    input.addEventListener("input", () => {
      // Only keep the last typed digit, in case of paste or fast typing
      input.value = input.value.replace(/[^0-9]/g, "").slice(-1);

      if (input.value && index < inputElements.length - 1) {
        inputElements[index + 1].focus();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        inputElements[index - 1].focus();
      }
    });
  });
}

// Reads the combined value across all boxes, e.g. "482913".
function getOtpValue(inputElements) {
  return inputElements.map((input) => input.value).join("");
}

// Clears every box and refocuses the first one - used after a wrong
// attempt or when a fresh code is requested.
function clearOtpBoxes(inputElements) {
  inputElements.forEach((input) => {
    input.value = "";
  });
  inputElements[0].focus();
}
