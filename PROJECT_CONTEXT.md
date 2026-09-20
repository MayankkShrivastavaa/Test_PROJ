# PROJECT_CONTEXT.md

## Project Overview

SecureID is a Full Stack Developer internship assignment. It requires building
a Registration and Login journey for an IAM-style (Identity & Access
Management) product, using HTML/CSS/JavaScript on the frontend and
Node.js/Express on the backend. The full journey (per the assignment's
Implementation Guidelines) is:

Registration → Email OTP → SMS OTP → MFA Setup (Authenticator App) →
MFA Verification → Registration Success → Login

Later phases (Login, session-based authentication, JWT-based
authentication) are not started, and a live-coding video explaining the
implementation without AI assistance may be triggered separately by the
internship admin.

The final site must be deployed on Vercel at `<name>-secureid.vercel.app`.

## Current Phase

**Phase 5 — Vercel deployment prep complete (code and config fixed and re-tested locally; the actual `git push` / Vercel dashboard steps happen outside this environment, with the developer)**

## Completed Features

- Registration form (Full Name, Email, Mobile with country code, Password,
  Terms checkbox) matching the reference screenshot.
- Live password-strength checklist (4 rules) with show/hide password toggle.
- Client-side validation for fast feedback (not trusted as the real check).
- `POST /api/register` backend endpoint: validates input, checks for
  duplicate email, hashes password with bcrypt, stores user in an
  in-memory store, generates an email OTP challenge, and returns a success
  response with `nextStep: "email-otp"` plus the `challengeId`/`expiresAt`
  needed to drive the next screen.
- Email OTP screen: 6-digit auto-advancing input boxes, live countdown
  timer synced to the backend's real `expiresAt`, auto-verifies once all
  6 digits are entered. States implemented: correct code, wrong code
  (attempts remaining shown), expired code, max-attempts-reached (shares
  the same locked visual as expired).
- On successful email verification, the backend immediately generates an
  SMS OTP challenge and the frontend transitions straight into the
  Mobile OTP screen — no manual step in between.
- Mobile OTP screen: same 6-box/countdown/auto-verify pattern as email,
  with its own default/wrong/expired states, PLUS a "Wrong number?
  Change" link that reveals an inline mini-form (country code + number).
  Submitting it updates the user's stored mobile number and immediately
  issues a fresh SMS challenge for the corrected number.
- Backend endpoints `POST /api/send-sms-otp` (resend), `POST
  /api/verify-sms-otp` (verify, reusing the exact same `otpService`
  logic as email), and `POST /api/change-mobile` (update number + resend).
- On successful mobile verification, the frontend moves straight into
  MFA setup (no placeholder message anymore — this was the last gap
  closed this phase).
- **Set Up MFA screen**: shows all three method options from the
  reference screenshots (Authenticator App, SMS Authentication, Email
  Authentication) for visual fidelity, but only Authenticator App is
  selectable/functional — the other two are visibly disabled with a
  "(coming soon)" label, per the earlier architecture decision.
- **Authenticator Setup screen**: calls `POST /api/mfa/setup`, displays
  the returned QR code image, and a "Can't scan? Enter setup key"
  fallback that reveals the raw secret as text.
- **MFA Verification screen**: 6-digit auto-verifying input, calls
  `POST /api/mfa/verify`. Verified with a REAL independent TOTP
  implementation (Python's `pyotp`, standing in for an actual
  authenticator app) that the backend's generated secret produces
  correctly-verifiable codes — this is genuine TOTP, not a simulation.
  Wrong-code state implemented; a "Can't access your app?" link shows an
  informational message (no backup-code recovery flow — not required by
  the assignment).
- **Registration Success screen**: checklist (Email verified / Mobile
  verified / MFA enabled) and a "Continue to Login" button. Since Login
  doesn't exist yet, this button shows a clear placeholder alert instead
  of silently doing nothing or linking somewhere broken.
- Full happy-path flow tested end-to-end via curl AND with a real
  independently-computed TOTP code: register → email OTP → SMS OTP →
  MFA setup → MFA verify → success.

## Current Frontend

- `frontend/index.html` — seven screens now exist: `screen-register`,
  `screen-email-otp`, `screen-sms-otp`, `screen-mfa-setup`,
  `screen-mfa-qr`, `screen-mfa-verify`, and `screen-success`. Only one
  has `.active` at a time. `screen-mfa-verify` reuses the `.otp-screen`
  class and OTP-box markup pattern; `screen-mfa-setup`, `screen-mfa-qr`,
  and `screen-success` are new layouts (method list, QR image, success
  checklist).
- `frontend/css/style.css` — added styles for the MFA method list (with
  a visually distinct disabled state for SMS/Email options), the QR
  image container and setup-key reveal box, and the success screen's
  checklist.
- `frontend/js/passwordStrength.js` — unchanged.
- `frontend/js/otpInput.js` — unchanged; now reused by a third screen
  (`screen-mfa-verify`) with zero modification, exactly as intended.
- `frontend/js/api.js` — added `setupMfa(userId)` and `verifyMfa(userId,
  code)`, same `{ ok, data, error }` wrapper pattern throughout.
- `frontend/js/main.js` — the SMS OTP success handler now calls
  `startMfaSetupFlow()` instead of showing a placeholder message. Added
  `setupMfaScreens()`, `handleMfaSetupContinue()` (calls `/api/mfa/setup`,
  populates the QR image and setup key), `handleMfaVerify()` (calls
  `/api/mfa/verify`, handles wrong-code state), and `showSuccessScreen()`.

## Current Backend

- `backend/app.js` — unchanged.
- `backend/server.js` — unchanged.
- `backend/routes/authRoute.js` — added `POST /api/mfa/setup`,
  `POST /api/mfa/verify`.
- `backend/controllers/authController.js` — added `setupMfa` (generates
  a TOTP secret + QR code via `mfaService`, stores the secret as
  "pending" on the user) and `verifyMfa` (checks a submitted code
  against the stored secret; on success, marks `mfaEnabled: true` and
  returns `nextStep: "success"`).
- `backend/services/mfaService.js` — NEW. `generateMfaSetup(userEmail)`
  (generates a TOTP secret via `otplib`, builds an `otpauth://` URI, and
  renders it as a QR code data URL via the `qrcode` package) and
  `verifyTotpCode(secret, code)` (checks a submitted code against a
  secret, with `otplib`'s built-in clock-drift tolerance).
- `backend/store/userStore.js` — added `mfaSecret: null` to the initial
  user shape, plus `setMfaSecret(userId, secret)` (stores the secret as
  "pending" - does not itself enable MFA) and `markMfaEnabled(userId)`.
- `backend/store/challengeStore.js`, `backend/services/otpService.js`,
  `backend/utils/validators.js` — unchanged; MFA/TOTP deliberately does
  NOT use the challenge model at all (see "Important Technical
  Decisions" for why).
- `api/index.js` — unchanged.

**Still not created (not yet needed):** `backend/middlewares/validateBody.js`.

## Current API Endpoints

| Method | Path | Purpose | Request Body | Key Response Fields | Frontend Screen |
|---|---|---|---|---|---|
| GET | `/api/health` | Basic server liveness check | — | `{ status: "ok" }` | none (dev/debug only) |
| POST | `/api/register` | Create a new user account, start email OTP | `{ fullName, email, countryCode, mobile, password }` | `{ msg, nextStep, challengeId, expiresAt, user: {...} }` | Registration → Email OTP |
| POST | `/api/send-email-otp` | Resend an email OTP | `{ userId }` | `{ msg, challengeId, expiresAt }` | Email OTP screen |
| POST | `/api/verify-email-otp` | Verify a submitted email code; on success, also generates the SMS OTP challenge | `{ challengeId, code }` | `{ msg }` plus one of: `nextStep, challengeId, expiresAt, mobile` (success) / `attemptsRemaining` (wrong) / `codeExpired: true` (expired) / `maxAttemptsReached: true` (locked) | Email OTP → Mobile OTP |
| POST | `/api/send-sms-otp` | Resend an SMS OTP | `{ userId }` | `{ msg, challengeId, expiresAt }` | Mobile OTP screen |
| POST | `/api/verify-sms-otp` | Verify a submitted mobile code | `{ challengeId, code }` | `{ msg }` plus one of: `nextStep: "mfa-setup"` (success) / `attemptsRemaining` (wrong) / `codeExpired: true` / `maxAttemptsReached: true` | Mobile OTP screen (all states) |
| POST | `/api/change-mobile` | Update mobile number and resend a fresh SMS OTP ("Wrong number? Change") | `{ userId, countryCode, mobile }` | `{ msg, mobile, challengeId, expiresAt }` | Mobile OTP screen (mini-form) |
| POST | `/api/mfa/setup` | Generate a TOTP secret + QR code for Authenticator App setup | `{ userId }` | `{ msg, qrCodeDataUrl, setupKey }` | Set Up MFA → Authenticator Setup |
| POST | `/api/mfa/verify` | Verify a TOTP code from the user's authenticator app | `{ userId, code }` | `{ msg, nextStep: "success" }` on success; `{ msg, invalidCode: true }` on wrong code | MFA Verification |
| GET | `/api/dev/last-otp` | **Test-only**, disabled in production: retrieve the current plain OTP for a challenge | query: `challengeId` | `{ challengeId, otp }` | none — evaluator/testing tool only |

## Current User Flow

Registration Form → validation → `POST /api/register` → user created,
email OTP challenge generated → Email OTP screen (countdown, auto-verify)
→ `POST /api/verify-email-otp` → on success, marks `emailVerified: true`
AND generates a new SMS OTP challenge → Mobile OTP screen (countdown,
auto-verify) → `POST /api/verify-sms-otp` → on success, marks
`mobileVerified: true` → frontend calls `startMfaSetupFlow()`

→ **Set Up MFA screen**: user sees all three method options, only
  Authenticator App is selectable → clicks Continue →
  `POST /api/mfa/setup` → backend generates a TOTP secret, stores it as
  "pending" on the user, returns a QR code + manual setup key

→ **Authenticator Setup screen**: user scans the QR code (or manually
  enters the setup key) in a real authenticator app → clicks Continue
  (pure frontend transition, no API call)

→ **MFA Verification screen**: user types the 6-digit code their
  authenticator app is currently showing → auto-verifies →
  `POST /api/mfa/verify` → backend checks the code against the stored
  secret using real TOTP math (`otplib`) → wrong code shows an inline
  error and clears the boxes; correct code marks `mfaEnabled: true` and
  returns `nextStep: "success"`

→ **Registration Success screen**: shows the three-item checklist (all
  true by this point) and a "Continue to Login" button, which currently
  shows a placeholder alert since the Login screen doesn't exist yet.

**Side path, available any time the Mobile OTP screen is showing:** click
"Wrong number? Change" → mini-form appears → submit new number →
`fetch POST /api/change-mobile` → backend updates `user.mobile`, resets
`mobileVerified: false`, issues a brand new SMS challenge → frontend
restarts the Mobile OTP screen with the corrected number and a fresh
timer.

**This is now the complete Registration journey described in the
guidelines**, end to end, tested via curl with a real independently
computed TOTP code. What's left for the assignment as a whole is Login
(Part 2, a separate phase) and deploying this to Vercel (see "Are we
done with Part 1?" discussion — deployment is the only remaining Part 1
requirement).

## Data Models / Storage

**User** (in `userStore.js`, an in-memory `Map`):
```js
{
  id: "u_1",
  fullName: "Priya Sharma",
  email: "priya@example.com",      // lowercased
  mobile: "+919876543210",          // countryCode + number combined
  passwordHash: "$2b$10$...",       // bcrypt hash, never the plain password
  emailVerified: false,
  mobileVerified: false,
  mfaEnabled: false,
  mfaSecret: null,                  // set (but mfaEnabled still false) once
                                     // MFA setup begins; TOTP secret, kept
                                     // only server-side after initial setup
  createdAt: "2026-...isostring..."
}
```

**Challenge** (in `challengeStore.js`, an in-memory `Map`):
```js
{
  challengeId: "ch_1",
  userId: "u_1",
  channel: "email",                 // or "sms" - same shape, both channels now in active use
  otpHash: "$2b$10$...",            // bcrypt hash of the 6-digit code
  expiresAt: 1737200000000,         // Date.now() + 3 minutes, set at creation
  attempts: 0,
  maxAttempts: 3,
  used: false
}
```

A separate, deliberately-not-persisted side-channel map inside
`otpService.js` (`devOnlyPlainOtpByChallengeId`) remembers the plain OTP
per challengeId purely so the gated `/api/dev/last-otp` endpoint can
return it. This map is never consulted by the real
register/send/verify flow.

## Important Technical Decisions

- **Vanilla HTML/CSS/JS** for the frontend — no React, no build step,
  guidelines explicitly call for HTML/CSS/JS.
- **Node.js + Express** for the backend, structured in layers:
  routes (wiring only) → controllers (request/response + validation
  orchestration) → store (data access). This mirrors the developer's
  existing Leave-Manager project style (camelCase, try/catch in every
  controller function, consistent `{ msg, ... }` response shape).
- **In-memory `Map`, not a database.** The guidelines require "User /
  Challenge Storage" but do not mandate persistence. A database was
  judged unnecessary complexity for this assignment. Known limitation:
  data is lost on server restart, and on Vercel, serverless functions
  may not reliably share memory between separate invocations. Accepted
  for now; will revisit only if real deployment testing shows it's a
  problem.
- **bcrypt-style** password/OTP hashing via `bcryptjs` (switched from
  native `bcrypt` this phase — see the deployment-specific decision
  below; identical API and hash format, so this was a zero-behavior-change
  swap, re-verified with the full end-to-end test suite after switching).
- **Frontend and backend are two separate top-level folders**
  (`frontend/`, `backend/`), not a shared `public/` folder, per explicit
  developer instruction. `api/index.js` is a thin Vercel serverless
  adapter only, containing no business logic.
- **CORS enabled** on the backend (`cors()` in `app.js`) because during
  local development the frontend (opened directly, or via a static file
  server) and backend (`localhost:5000`) are different origins, and
  browsers block cross-origin `fetch()` by default without it. On Vercel,
  the `vercel.json` rewrites make both accessible under the same domain,
  so this becomes a harmless no-op in production.
- **Frontend API base URL is now environment-aware, not hardcoded.**
  `frontend/js/api.js` checks `window.location.hostname`: `localhost`/
  `127.0.0.1` → `http://localhost:5000/api` (local dev, two separate
  servers); anything else (a real deployed domain) → relative `/api`
  (same-origin, works because `vercel.json` serves both the frontend and
  the backend function under the same domain). This was the Known Issue
  flagged at the end of Phase 4 — now resolved.
- **Switched from `bcrypt` to `bcryptjs` for this deployment.** `bcrypt`
  is a native C++ addon that has to be compiled for the exact target
  environment — a well-documented, common source of "works locally,
  fails on deploy" failures on serverless platforms. `bcryptjs` is a
  pure-JavaScript, API-identical drop-in (same `hash`/`compare`
  functions, same hash format) with zero native compilation, eliminating
  that entire failure class before it could happen. Re-verified the full
  end-to-end flow after switching — zero behavior change (136 packages
  installed instead of 186, since bcryptjs pulls no native-build tooling).
- **`vercel.json` uses the `builds` + `routes` config, not `rewrites`.**
  The `rewrites`-based config used earlier in this project risked
  stripping the sub-path from `/api/*` requests before they reached the
  Express app (e.g. `/api/register` could collapse to just `/api`, which
  would 404 or misroute inside Express). `builds` + `routes` is the
  long-established, widely-documented pattern for running a full Express
  app as a single Vercel serverless function, and correctly preserves
  the full request path for Express to route internally exactly as it
  does locally.
- **Deployment itself could not be tested by the AI directly** — the
  sandboxed tool environment used to build this project has no network
  access to vercel.com or GitHub's web UI (only a small allow-list of
  package-registry and Anthropic domains). Everything that CAN be
  verified locally (server starts, full API flow works, JSON configs
  are syntactically valid) was verified; the actual `git push` and
  Vercel dashboard/CLI steps must be run by the developer, with any
  real deployment errors reported back for debugging.
- **OTP generated with `crypto.randomInt`, not `Math.random()`.**
  `Math.random()` is not cryptographically secure and its output can be
  predicted in some cases — never acceptable for anything
  security-related, even a "simulated" OTP for an assignment.
- **OTP is stored only as a bcrypt hash**, same library/pattern already
  used for passwords. The plain code exists only transiently: once in
  the `console.log` simulated-delivery message, and once in a
  deliberately separate dev-only in-memory map used solely by the gated
  test endpoint — never in the normal `challengeStore` record itself.
- **One challengeId = one still-valid code, always.** Resending or
  requesting a new code doesn't "reset" the old challenge — it creates
  a brand new one and the old one is simply abandoned. This keeps the
  mental model simple: a challenge is single-use and never mutated
  except to bump `attempts` or flip `used`.
- **Max-attempts and expired states share one visual "locked" state** on
  both the Email and Mobile OTP screens (`data-state="expired"`), rather
  than giving max-attempts its own distinct look. The reference
  screenshots do show a visually distinct max-attempts screen for SMS —
  this was a deliberate simplification to reuse one CSS state with a
  different message, not an oversight. Worth a final pass if pixel-exact
  fidelity to the max-attempts screenshot matters for evaluation.
- **Dev-only OTP retrieval endpoint gated by `NODE_ENV`**, not by a
  separate feature flag — verified directly (not just assumed) that the
  route is not registered at all when `NODE_ENV=production`.
- **`otpService.js` and `challengeStore.js` needed zero changes for SMS.**
  Writing them generically in Phase 2 (parameterized by `channel`) meant
  Phase 3 only had to add controller/route/frontend code — this was a
  deliberate bet that paid off, worth noting as a concrete example of
  "small reusable logic" paying for itself.
- **"Wrong number? Change" resets `mobileVerified` to `false`** whenever
  the number is changed, even though at that point in the flow it was
  already `false` (mobile verification hasn't succeeded yet by
  definition). This is intentional defensive coding — if this function
  were ever reused later (e.g. a "change my number" feature after
  Registration), a stale `true` value could otherwise linger.
- **MFA implements only the Authenticator App (TOTP) path**, per the
  architecture decision recorded earlier in this document. The Set Up
  MFA screen still visually shows SMS Authentication and Email
  Authentication as options (for fidelity to the reference screenshots)
  but both are disabled — no backend work exists for them, and none is
  planned unless explicitly requested.
- **MFA does NOT use the `challengeId`/`otpHash`/`expiresAt` model at
  all.** TOTP is a fundamentally different verification model: a
  long-lived shared secret plus time-based math, not a one-time
  server-generated code. Using the OTP challenge model here would have
  been the wrong abstraction — this was a deliberate design choice, not
  an oversight that two different systems exist side by side.
- **`otplib` and `qrcode` are used as-is**, not wrapped in extra
  abstraction, since they each do one well-defined job (TOTP math; QR
  image rendering) and reimplementing either by hand would be a security
  risk (TOTP) or pointless complexity (QR encoding) for no benefit.
- **The TOTP secret is regenerated every time `/api/mfa/setup` is
  called**, rather than trying to resume/reuse a previous incomplete
  setup. If a user backs out of scanning the QR code and returns, they
  simply scan a fresh one. This keeps the mental model simple, at the
  cost of invalidating an old QR code the user might have already
  scanned but not yet verified — judged an acceptable trade-off for an
  assignment-scale project.
- **TOTP codes are correctly NOT single-use** (verified directly: the
  same correct code was accepted twice in a row during testing). This is
  expected, standard TOTP behavior — a code is valid for its ~30-second
  window regardless of whether it's already been submitted — and is not
  a bug, even though it looks different from the OTP challenges'
  single-use behavior.
- **"Continue to Login" shows a placeholder alert**, not a silent no-op
  or a broken link, since Login is a genuinely separate, not-yet-built
  phase.

## Concepts Learned (this phase)

- Separating routes (URL wiring) from controllers (actual logic) —
  already familiar from the developer's prior project, reinforced here.
- Why client-side validation is a UX convenience only, and the backend
  must independently re-validate everything.
- Why password hashing (bcrypt) happens on the backend only.
- The reasoning behind splitting `backend/app.js`, `backend/server.js`,
  and `api/index.js` for Vercel compatibility.
- Why CORS matters locally but not necessarily in production.
- OTP generation, hashing, `challengeId`, server-side expiry/attempts,
  single-use tokens, and backend-driven navigation — all carried over
  from Phase 2 and reinforced here.
- **Designing for reuse before you need it (cautiously)**: `otpService.js`
  and `challengeStore.js` were written generically enough in Phase 2 to
  need zero changes for SMS in Phase 3 — a concrete, first-hand example
  of why "parameterize the thing that's likely to repeat" is worth doing
  even when only one case exists yet.
- **Sequential multi-step verification flows**: how one endpoint's
  success response (`verifyEmailOtp`) can kick off the *next* step's
  setup work (creating the SMS challenge) server-side, so the frontend
  never has to orchestrate "verify email, then separately ask for an SMS
  code" as two decisions of its own — it just reacts to what the backend
  hands it.
- **Correcting user input mid-flow without starting over**: the "Wrong
  number? Change" pattern — updating one field on an otherwise-in-progress
  record, and re-triggering the same challenge-creation logic used
  everywhere else, rather than writing a one-off special case.
- **TOTP (Time-based One-Time Password)**: how a shared secret plus the
  current time produces a rotating code independently on both sides
  (user's app and our server), with no code ever transmitted between
  them ahead of time — fundamentally different from email/SMS OTP, where
  the server generates the code and sends it.
- **Why TOTP needs a persistent per-user secret, not a disposable
  challenge**: MFA is meant to stay enabled indefinitely, so the secret
  has to live somewhere durable (here, the user record) rather than
  expiring like a login-time OTP would.
- **QR codes as a delivery mechanism, not a new kind of cryptography**:
  the QR code is just a convenient encoding of the same `otpauth://` URI
  a person could type in manually via the setup key — recognizing that
  distinction matters for explaining this without overstating what's
  "new" about it.
- **Clock-drift tolerance**: why `otplib`'s default behavior of checking
  a small window of time steps (not just the exact current one) exists —
  so that a phone's clock being a few seconds off from the server's
  doesn't lock a legitimate user out.
- **Why TOTP verification isn't single-use**: an email/SMS OTP is
  consumed and invalidated after one successful check because it's a
  one-time credential by design; a TOTP secret is a standing credential
  and its codes just rotate — reusing the current window's code is
  expected, not a security gap, since it's still time-bound.

## Known Issues
- No automated tests exist yet — testing so far has been manual (see
  Testing Status below).
- The in-memory store limitation described earlier (data loss on
  restart / possible inconsistency across serverless invocations on
  Vercel) is unresolved and deferred.
- The registration form's mobile number field does minimal validation
  (7–15 digits) and does not validate against real country-specific
  mobile number formats. The same minimal validation is reused for the
  "Wrong number? Change" mini-form.
- Both the Email and Mobile OTP flows' "max attempts reached" state
  reuses the same visual treatment as "expired" rather than having its
  own distinct look, even though the SMS reference screenshot (3b) shows
  a visually distinct max-attempts screen. Flagged as a possible final
  polish item, not forgotten.
- Resend cooldown (25s) and OTP expiry (3 min) are duplicated as
  constants in both `backend/services/otpService.js` and
  `frontend/js/main.js` (now for both email and SMS timers). The expiry
  timers read the real `expiresAt` from the backend so they can't drift,
  but the resend cooldown duration itself is only a frontend constant.
- "Can't access your app?" on the MFA Verification screen shows an
  informational message only — there is no backup/recovery code flow,
  since the assignment doesn't call for one. If a user gets fully locked
  out of their authenticator app in this build, there's currently no
  recovery path other than a developer manually resetting their user
  record.
- SMS Authentication and Email Authentication are shown as visibly
  disabled options on the Set Up MFA screen, matching the reference
  screenshots' appearance, but have zero backend support - clicking
  them does nothing (they're disabled `<input>` elements, so this is
  enforced by the browser, not just styling).
- The mobile-change mini-form's validation is minimal (same
  7–15-digit check as registration) and does not check for duplicate
  numbers across users, since the assignment doesn't require multiple
  users to have unique mobile numbers (only email is checked for
  uniqueness, matching the original registration requirements).

## Not Yet Implemented

- Login journey (Part 2, entirely separate phase): a login screen
  (email + password, presumably its own MFA challenge on login too,
  though this hasn't been scoped yet) and the backend endpoint(s) to
  support it.
- Session-based authentication (cookies, `GET /api/me`, `POST /api/logout`)
- JWT-based authentication (`POST /api/token`, `GET /api/protected`)
- Actual Vercel deployment and testing of the deployed URL — **this is
  the only remaining requirement for Part 1** (see the "Are we done with
  Part 1?" answer given alongside this update).
- `backend/middlewares/validateBody.js` (still not needed — validation
  continues to live directly in controllers, matching the developer's
  existing style; will only be introduced if it becomes clearly
  repetitive across many endpoints)
- Backup/recovery codes for MFA (not required by the assignment; noted
  as a Known Issue above rather than a planned feature)

## Next Implementation Step

**The developer runs the actual Vercel deployment** (git push, connect
repo to Vercel, deploy, set env vars, test the live URL) — see the
step-by-step deployment guide given alongside this update. All code and
config needed for deployment is now in place and re-verified locally:
the API base URL is environment-aware, `vercel.json` uses the
well-established `builds`/`routes` pattern, and `bcrypt` was replaced
with the pure-JS `bcryptjs` to remove native-module deployment risk.
Once deployed, the full flow (register → email OTP → SMS OTP → MFA
setup → MFA verify → success) needs to be manually re-tested on the
live `*.vercel.app` URL using the same checklist already used locally —
this cannot be done by the AI directly, since the sandboxed tool
environment has no network access to vercel.com. After that's confirmed
working, Part 1 is fully complete, and Login (Part 2) can begin as a
separate phase.

## How To Run (local development)

From the `secureid/` project root:

```
npm install
npm run dev
```

This starts the backend at `http://localhost:5000`.

Open `frontend/index.html` directly in a browser, or serve it with a
simple static server (e.g. the VS Code "Live Server" extension) on a
different port such as `http://localhost:5500`. See README.md for exact
step-by-step commands.

## Environment Variables

| Name | Purpose | Required? |
|---|---|---|
| `PORT` | Port the backend listens on locally | Optional, defaults to 5000 |
| `NODE_ENV` | When set to `"production"`, disables the `/api/dev/last-otp` test-only endpoint | Optional locally; **must be set to `production` in the Vercel project's environment variables** |

No secrets exist yet (no JWT secret, no API keys). TOTP secrets are
generated per-user and stored on the user record — not via an
environment variable — so MFA didn't add any new env vars. This table
will grow once JWT (a later phase) needs a signing secret.

## Testing Status

**Tested manually (via curl AND a real independent TOTP implementation),
passing, this phase:**
- Full happy path end-to-end in one sequence: register → email OTP →
  SMS OTP → MFA setup → MFA verify → `nextStep: "success"`.
- MFA setup returns a valid QR code data URL (`data:image/png;base64,...`)
  and a setup key.
- Wrong MFA code → `{ invalidCode: true }`, rejected correctly.
- **Correct MFA code, computed independently using Python's `pyotp`
  library against the exact secret our backend generated** → accepted.
  This proves the backend performs genuine TOTP verification compatible
  with real authenticator apps, not a simulated/fake check.
- Confirmed (deliberately, not by accident) that submitting the same
  correct TOTP code twice in a row both times succeeds — expected TOTP
  behavior, documented in Important Technical Decisions above so it
  isn't mistaken for a security bug later.

**Tested manually, carried over from earlier phases, still passing:**
- Valid registration, duplicate email, weak password, missing field,
  invalid email format (Phase 1).
- Email OTP wrong/expired/max-attempts/resend behaviors, dev endpoint
  gating (Phase 2).
- SMS OTP wrong/expired/max-attempts/resend, change-mobile (Phase 3).

**Not yet tested:**
- Frontend manual testing in an actual browser for the full seven-screen
  journey, including: scanning the real QR code with an actual
  authenticator app (Google Authenticator, Authy, etc.) rather than a
  script-computed code, the "Can't scan? Enter setup key" reveal, the
  MFA wrong-code visual state, and the final success screen's checklist
  and "Continue to Login" placeholder alert. This was built and reasoned
  through, and every backend behavior it depends on was verified
  directly, but the frontend screens themselves have not been clicked
  through in a live browser session — including, importantly, actually
  scanning the QR code with a phone. Please do this before considering
  Phase 4 fully done, since QR-code scanning specifically can't be
  verified via curl.
- Real-world timing edge cases on the email/SMS OTP screens (unchanged
  from earlier phases, still open).

## Git State

Recommended commit message for this phase:

```
feat: implement MFA via Authenticator App / TOTP (Phase 4)

- Add otplib and qrcode dependencies
- Add backend/services/mfaService.js (TOTP secret generation, QR code
  rendering, code verification)
- Add POST /api/mfa/setup and POST /api/mfa/verify
- Add userStore.setMfaSecret() and userStore.markMfaEnabled()
- Add Set Up MFA screen (method selection, Authenticator App only wired up)
- Add Authenticator Setup screen (QR code + manual setup key fallback)
- Add MFA Verification screen (reuses otpInput.js pattern) with wrong-code state
- Add Registration Success screen (checklist + Continue to Login placeholder)
- Verified end-to-end with a real independently-computed TOTP code (pyotp),
  confirming genuine TOTP compatibility, not a simulation
- This completes the full Part 1 Registration journey from the guidelines;
  only Vercel deployment remains for Part 1
```

Recommended commit message for THIS update (Vercel deployment prep):

```
chore: prepare project for Vercel deployment

- Make frontend/js/api.js API base URL environment-aware (localhost vs
  relative /api) instead of hardcoded to http://localhost:5000
- Replace vercel.json rewrites config with builds+routes, the
  well-established pattern for running a full Express app as a single
  Vercel serverless function without sub-path stripping risk
- Replace bcrypt (native addon) with bcryptjs (pure JS) to eliminate a
  common native-module deployment failure mode on serverless platforms;
  re-verified full end-to-end flow after the swap, zero behavior change
```


## AI HANDOFF INSTRUCTIONS

### Instructions for the next AI

1. Read this file (`PROJECT_CONTEXT.md`) first, in full, before doing
   anything else.
2. Inspect the actual current project files on disk — do not assume this
   document is perfectly up to date; verify against real code.
3. Do NOT recreate or rewrite anything listed under "Completed Features"
   unless the developer explicitly asks for a change to existing
   behavior.
4. Do NOT change the approved architecture (frontend/ and backend/ as
   separate top-level folders, in-memory storage, no React, no database,
   no complicated auth libraries) without first explaining why a change
   is necessary and getting explicit approval.
5. Continue from the phase listed under "Current Phase" and follow
   "Next Implementation Step" exactly — do not skip ahead to later
   phases (OTP, MFA, sessions, JWT) without the developer's direction.
6. Preserve the existing coding style: camelCase naming, routes contain
   only routing, controllers contain request/response + validation
   logic, try/catch around all async controller code, consistent
   `{ msg, ... }`-style JSON responses, small named validator functions
   in `utils/validators.js`.
7. Ask before making any major architectural change (e.g. introducing a
   database, switching to React, adding an auth library, restructuring
   folders).
8. This project is for an internship assignment where the developer must
   personally explain and, in one required phase, live-code changes
   without AI assistance. Optimize every explanation and every piece of
   code for the developer's understanding, not for minimal code or
   maximum sophistication.
9. After completing a phase, update this file to reflect the ACTUAL
   current state of the project — do not describe future or planned
   work as if it is already implemented.
