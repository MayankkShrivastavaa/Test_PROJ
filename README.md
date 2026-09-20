# SecureID

An IAM-style Registration & Login journey — Full Stack Developer internship
assignment.

**Current status:** Phase 1 (Registration form + account creation) complete.
See `PROJECT_CONTEXT.md` for full details on what's implemented, what isn't,
and what comes next.

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript (no framework, no build step)
- Backend: Node.js, Express
- Storage: in-memory (no database) — see PROJECT_CONTEXT.md for why
- Password hashing: bcrypt

## Project Structure

```
secureid/
├── frontend/       → static HTML/CSS/JS, served as-is
├── backend/        → Express app (routes, controllers, store, utils)
├── api/            → Vercel serverless adapter only (no logic)
├── vercel.json     → routes /api/* to the backend, everything else to frontend
└── PROJECT_CONTEXT.md → living document describing current project state
```

## Running Locally (Windows)

### 1. Install backend dependencies

Open a terminal in the `secureid` folder:

```
npm install
```

### 2. Start the backend

```
npm run dev
```

You should see:
```
SecureID backend running at http://localhost:5000
```

Leave this terminal running.

### 3. Open the frontend

The frontend is plain static files, so you have two options:

**Option A — just open the file:**
Double-click `frontend/index.html`, or right-click → Open with → your browser.

**Option B — serve it (recommended, avoids some browser file:// quirks):**
If you have the VS Code "Live Server" extension, right-click
`frontend/index.html` → "Open with Live Server". It will open something like
`http://localhost:5500`.

### 4. Test the registration flow

1. Fill in the form with a valid name, email, mobile number, and a password
   that satisfies all four checklist rules.
2. Check the Terms & Conditions checkbox.
3. Click "Create Account".
4. You should see a green success message. Check the backend terminal —
   you won't see the OTP yet (that's Phase 2), but you can confirm the
   request was logged if you add a `console.log` temporarily.

### Why CORS is enabled

The frontend (e.g. `http://localhost:5500`) and backend
(`http://localhost:5000`) run on different ports, which browsers treat as
different origins. Without CORS enabled on the backend, the browser would
block the frontend's `fetch()` calls. `backend/app.js` includes `cors()`
to allow this during local development.

## Testing Checklist

### Frontend
- [ ] Submit with all fields empty → see field-level error messages
- [ ] Enter an invalid email (e.g. `abc`) → see email error
- [ ] Enter an invalid mobile number (e.g. `123`) → see mobile error
- [ ] Enter a weak password (e.g. `abc`) → checklist stays unchecked, form
      blocks submission with a status message
- [ ] Leave Terms checkbox unchecked → see terms error
- [ ] Fill everything in correctly → see success message, form resets
- [ ] Click the eye icon → password becomes visible/hidden correctly

### Backend (can be tested with curl, Postman, or the frontend)
- [ ] Valid registration → `201`, response includes `nextStep: "email-otp"`
- [ ] Missing a required field → `400` with a specific message
- [ ] Invalid email format → `400`
- [ ] Weak password → `400` with a `passwordRules` breakdown
- [ ] Duplicate email (register the same email twice) → `400`,
      `"Email Already Registered"`

### Verifying security properties

**Password is hashed, not stored in plain text:**
Temporarily add `console.log(userStore)` (or inspect via the debugger) right
after a successful registration in `authController.js`, and look at the
`passwordHash` field — it will be a long string starting with `$2b$`, not
the password you typed.

**Plain password is never returned in the API response:**
Look at the JSON response from `POST /api/register` — the `user` object
only contains `id, fullName, email, mobile, emailVerified, mobileVerified,
mfaEnabled`. There is no `password` or `passwordHash` field, because
`authController.js` builds that response object manually rather than
sending the full user record back.

**Backend validation works even if frontend validation is bypassed:**
Use curl or Postman to send a request directly to
`http://localhost:5000/api/register` with a weak password or a missing
field, skipping the browser and the frontend's JS entirely. The backend
still rejects it, because `authController.js` re-runs every check
independently — it never trusts that the frontend already validated
anything.

Example:
```
curl -X POST http://localhost:5000/api/register -H "Content-Type: application/json" -d "{\"fullName\":\"Test\",\"email\":\"test@example.com\",\"mobile\":\"9876543210\",\"password\":\"weak\"}"
```

## Deployment

Not yet deployed. Vercel deployment steps will be documented once more of
the journey is implemented (see PROJECT_CONTEXT.md → "Not Yet Implemented").
