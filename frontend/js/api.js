// Every function here does ONE job: call one backend endpoint and return
// a plain, predictable result shape: { ok, data, error }.
//
// main.js never touches fetch() or JSON parsing directly - it just calls
// these functions and reads the result. This keeps the "flow" logic in
// main.js separate from the "how do I talk to the backend" logic here.

// LOCAL DEV: frontend and backend run as two separate servers on two
// different ports (e.g. frontend on :5500 via Live Server, backend on
// :5000 via `npm run dev`), so we need the full localhost:5000 URL.
//
// DEPLOYED (Vercel): vercel.json routes both the frontend files and the
// /api/* serverless function under the SAME domain, so a relative "/api"
// path works and automatically points at whatever domain the page is
// actually being served from - no hardcoded production URL needed.
//
// We only need to tell these two cases apart, which we can do just by
// checking the hostname the page itself is currently running on.
const API_BASE_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000/api"
    : "/api";

async function registerUser(formData) {
  try {
    const response = await fetch(`${API_BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    const data = await response.json();

    if (!response.ok) {
      // Even on an error response, the backend may include extra fields
      // (like passwordRules) - pass the whole data object through so the
      // caller can use it if needed, not just the message.
      return { ok: false, data, error: data.msg || "Registration failed" };
    }

    return { ok: true, data, error: null };
  } catch (networkError) {
    console.log(networkError);
    return {
      ok: false,
      data: null,
      error: "Could not reach the server. Is the backend running?",
    };
  }
}

async function sendEmailOtp(userId) {
  try {
    const response = await fetch(`${API_BASE_URL}/send-email-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, data, error: data.msg || "Could not send code" };
    }

    return { ok: true, data, error: null };
  } catch (networkError) {
    console.log(networkError);
    return {
      ok: false,
      data: null,
      error: "Could not reach the server. Is the backend running?",
    };
  }
}

async function verifyEmailOtp(challengeId, code) {
  try {
    const response = await fetch(`${API_BASE_URL}/verify-email-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, code }),
    });

    const data = await response.json();

    // Note: we return ok:true/false based on HTTP status, but the CALLER
    // still needs to look at `data` for wrong-code vs expired vs
    // max-attempts, since those are all "error" responses with different
    // meanings, not just a single failure case.
    if (!response.ok) {
      return { ok: false, data, error: data.msg || "Verification failed" };
    }

    return { ok: true, data, error: null };
  } catch (networkError) {
    console.log(networkError);
    return {
      ok: false,
      data: null,
      error: "Could not reach the server. Is the backend running?",
    };
  }
}

async function sendSmsOtp(userId) {
  try {
    const response = await fetch(`${API_BASE_URL}/send-sms-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, data, error: data.msg || "Could not send code" };
    }

    return { ok: true, data, error: null };
  } catch (networkError) {
    console.log(networkError);
    return {
      ok: false,
      data: null,
      error: "Could not reach the server. Is the backend running?",
    };
  }
}

async function verifySmsOtp(challengeId, code) {
  try {
    const response = await fetch(`${API_BASE_URL}/verify-sms-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, code }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, data, error: data.msg || "Verification failed" };
    }

    return { ok: true, data, error: null };
  } catch (networkError) {
    console.log(networkError);
    return {
      ok: false,
      data: null,
      error: "Could not reach the server. Is the backend running?",
    };
  }
}

async function changeMobile(userId, countryCode, mobile) {
  try {
    const response = await fetch(`${API_BASE_URL}/change-mobile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, countryCode, mobile }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, data, error: data.msg || "Could not update mobile number" };
    }

    return { ok: true, data, error: null };
  } catch (networkError) {
    console.log(networkError);
    return {
      ok: false,
      data: null,
      error: "Could not reach the server. Is the backend running?",
    };
  }
}

async function setupMfa(userId) {
  try {
    const response = await fetch(`${API_BASE_URL}/mfa/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, data, error: data.msg || "Could not start MFA setup" };
    }

    return { ok: true, data, error: null };
  } catch (networkError) {
    console.log(networkError);
    return {
      ok: false,
      data: null,
      error: "Could not reach the server. Is the backend running?",
    };
  }
}

async function verifyMfa(userId, code) {
  try {
    const response = await fetch(`${API_BASE_URL}/mfa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, code }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, data, error: data.msg || "Verification failed" };
    }

    return { ok: true, data, error: null };
  } catch (networkError) {
    console.log(networkError);
    return {
      ok: false,
      data: null,
      error: "Could not reach the server. Is the backend running?",
    };
  }
}
