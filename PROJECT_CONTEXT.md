# PROJECT_CONTEXT.md

## Project Overview

SecureID is a Full Stack Developer internship assignment: an IAM-style
(Identity & Access Management) product with a full Registration and
Login journey, built with HTML/CSS/JavaScript on the frontend and
Node.js/Express on the backend. The complete journey per the assignment's
Implementation Guidelines (Part 1 + Part 2) is:

Registration -> Email OTP -> SMS OTP -> MFA enabled -> Registration Success
-> Login -> Login MFA (Email OTP) -> Session created -> (JWT demonstrated
as a separate, independent auth mechanism)

**Both Part 1 (Registration) and Part 2 (Login, Session auth, JWT auth)
are now functionally complete and tested end-to-end.** The final site
must be deployed on Vercel at `<name>-secureid.vercel.app` - it already
is (see "Known Issues" for what still needs re-deploying after Part 2).

A live-coding video explaining the implementation without AI assistance
may be triggered separately by the internship admin; that is not part
of this file's tracked "phases."

## Current Phase

**Phase 7 - Part 2 complete: Login, session-based authentication, and
JWT-based authentication all implemented and tested end-to-end via curl
(register -> verify email/SMS/MFA -> login -> login MFA -> session ->
/api/me -> logout, plus a fully independent JWT issue/verify flow).
Frontend login screens built for all states shown in the reference
screenshots. NOT yet visually verified in a browser, and NOT yet
redeployed to Vercel - see Known Issues and Next Implementation Step.**

## Completed Features

### Part 1 - Registration (all previously completed, unchanged this phase)

- Registration form, live password-strength checklist, show/hide
  password, client-side + server-side validation, POST /api/register.
- Email OTP screen + POST /api/send-email-otp / POST
  /api/verify-email-otp (correct/wrong/expired states, real
  server-side expiry + attempt limiting).
- Mobile OTP screen + POST /api/send-sms-otp / POST
  /api/verify-sms-otp / POST /api/change-mobile ("Wrong number?
  Change"), with its own distinct max-attempts-locked visual state.
- MFA (Authenticator App / TOTP) setup + verification: POST
  /api/mfa/setup (generates a TOTP secret + QR code), POST
  /api/mfa/verify (real TOTP verification, confirmed against an
  independent Python pyotp computation, not just internally
  consistent).
- Registration Success screen.
- Desktop web-layout chrome: brand header, 5-dot step indicator,
  footer, desktop two-column password-checklist panel, error banners on
  every OTP error state, desktop Back/Continue pair on the Authenticator
  Setup screen.
- Deployed to Vercel; bcryptjs used instead of native bcrypt to
  avoid serverless native-module issues; vercel.json uses the
  builds/routes pattern.

### Part 2 - Login, Session auth, JWT auth (NEW this phase)

- POST /api/login: validates { emailOrUsername, password } against
  the stored user record. On success with mfaEnabled: true (always
  true for any user who completed this project's registration flow),
  generates a fresh email OTP challenge and responds
  { mfaRequired: true, method: "email", userId, challengeId,
  expiresAt }. Wrong password and "email doesn't exist" both return
  the exact same generic "Invalid email or password. Please try
  again." message (no user enumeration). Tracks failedLoginAttempts
  per user; after 5 consecutive failures, the account is locked for 15
  minutes (423 response with accountLocked: true and lockUntil), and
  even a correct password is rejected while locked.
- POST /api/verify-login-otp: verifies the login OTP challenge
  (reuses the exact same otpService.verifyOtpChallenge used by
  registration's email/SMS OTP - same wrong/expired/max-attempts
  response shapes). On success, creates a session
  (sessionStore.createSession) and sets an HttpOnly sid cookie.
- GET /api/me (protected by requireSession middleware): returns
  the authenticated user's safe fields (never passwordHash or
  mfaSecret). Returns 401 with no valid session cookie - confirmed
  directly via curl both ways.
- POST /api/logout: deletes the server-side session and clears the
  cookie. Confirmed directly: /api/me returns 401 again immediately
  after logout, using the exact same (now-invalidated) cookie.
- POST /api/token: an independent flow from the session-based
  login above - re-validates { emailOrUsername, password } from
  scratch and issues a short-lived (15-minute) JWT via jsonwebtoken,
  signed with process.env.JWT_SECRET. Does not create or touch a
  session at all.
- GET /api/protected (protected by requireJwt middleware): reads
  Authorization: Bearer <token>, verifies it, and only then returns a
  response. Confirmed directly: works with a real issued token, and
  correctly rejects both a missing header and a garbage/invalid token
  with 401.
- Frontend login screens (mobile-card style, matching the reference):
  Login (default + Invalid Credentials as one screen with a
  data-state toggle), Choose Method (Email OTP selectable/functional,
  SMS OTP and Authenticator App shown but disabled - same "show all
  options, wire up one" pattern as MFA setup), Login Email OTP (default/
  wrong/expired states, plus an on-screen numeric keypad - the one
  genuine visual difference from every other OTP screen in this project,
  present because the login reference screenshots explicitly show one
  and the registration ones don't).
- CORS updated for cookies: cors({ origin: true, credentials: true })
  replaces the earlier wildcard cors(), and cookie-parser
  middleware was added - both were unnecessary before login existed
  (nothing used cookies), and are required now.

## Current Frontend

- frontend/index.html - ten screens total now:
  screen-register, screen-email-otp, screen-sms-otp,
  screen-mfa-setup, screen-mfa-qr, screen-mfa-verify,
  screen-success (Part 1, unchanged), plus NEW: screen-login,
  screen-choose-method, screen-login-otp. Only one .active at a
  time, same pattern throughout.
- frontend/css/style.css - added: .login-shield-icon,
  .login-options-row/.remember-me-label/.or-divider/.btn-google
  for the Login screen; reused .mfa-shield-icon/.mfa-method-list/
  .mfa-method-option (already existed for MFA setup) for Choose
  Method; .numeric-keypad/.keypad-btn/.keypad-backspace for the
  Login OTP screen's keypad; extended the existing OTP data-state
  selectors (icon color, box border, expired fade) to also cover
  #screen-login-otp, while deliberately NOT extending the
  "hide resend-line on expired" rule to it, since the login reference's
  expired screen keeps the resend link visible (unlike registration's,
  which swaps to a big button) - a genuine, deliberate visual difference
  between the two OTP flows' expired states.
- frontend/js/passwordStrength.js - unchanged. A new, more generic
  setupPasswordVisibilityToggleFor(inputId, buttonId) was added
  directly in main.js instead, so the Login screen's password toggle
  doesn't depend on this file's hardcoded #password id.
- frontend/js/otpInput.js - getOtpValue() and clearOtpBoxes() are
  reused by the Login OTP screen; setupOtpBoxAutoAdvance() is NOT used
  there, since the login OTP boxes are readonly and only accept input
  via the on-screen keypad (a deliberate choice to avoid two divergent
  input paths - keypad clicks and native typing - falling out of sync).
- frontend/js/api.js - added loginUser(), verifyLoginOtp(),
  fetchMe(), logoutUser(). These four (and only these four) pass
  credentials: "include" in their fetch() calls, since they're the
  only calls that involve the session cookie. Login OTP resend
  deliberately reuses the EXISTING sendEmailOtp(userId) function
  unchanged - it was never actually tied to "registration" specifically,
  so no new backend endpoint or frontend wrapper was needed for it.
- frontend/js/main.js - added the entire Part 2 section:
  setupLoginScreens(), handleLoginSubmit() (handles both invalid
  credentials and account-locked responses with the same
  data-state="invalid" banner), startLoginOtpFlow() /
  startLoginOtpCountdown() / startLoginOtpResendCooldown() (mirror
  the email/SMS OTP timer functions, kept as separate functions/
  variables rather than generalized, consistent with this project's
  existing pattern of small parallel functions per OTP screen rather
  than one shared abstraction), the keypad's click handlers (write into
  the next-empty box; backspace clears the last-filled box), and
  handleLoginOtpVerify() (on success, calls fetchMe() to prove the
  session cookie actually works end-to-end, then shows a confirmation -
  see "Not Yet Implemented" for why there's no real dashboard screen).
  STEP_INDICATOR_MAP was extended so all three new screens map to
  null (hidden) - the login reference screenshots use a completely
  different desktop layout (a gradient sidebar panel) that was NOT
  built this phase, so the safest choice was to show no stepper at all
  on these screens rather than a misleading one.

## Current Backend

- backend/app.js - added cookie-parser middleware; changed
  cors() to cors({ origin: true, credentials: true }).
- backend/server.js, api/index.js - unchanged.
- backend/routes/authRoute.js - added POST /api/login,
  POST /api/verify-login-otp, GET /api/me (behind requireSession),
  POST /api/logout, POST /api/token, GET /api/protected (behind
  requireJwt).
- backend/controllers/authController.js - added loginUser,
  verifyLoginOtp, getMe, logout, issueToken,
  getProtectedResource, plus a shared getSessionCookieOptions()
  helper and module-level constants (MAX_FAILED_LOGIN_ATTEMPTS = 5,
  LOCKOUT_DURATION_MS = 15 minutes, JWT_EXPIRES_IN = "15m").
- backend/middlewares/requireSession.js - NEW. Reads the sid
  cookie, checks it against sessionStore, attaches req.userId or
  responds 401.
- backend/middlewares/requireJwt.js - NEW. Reads
  Authorization: Bearer <token>, verifies it with jsonwebtoken,
  attaches req.userId or responds 401. Deliberately independent of
  requireSession.js - the two auth mechanisms never share code or
  state, per the guidelines asking for both to be demonstrated
  separately.
- backend/store/sessionStore.js - NEW. In-memory Map keyed by a
  crypto.randomBytes(32)-generated session id (NOT a simple sequential
  id like u_1/ch_1 used elsewhere - a session id is unguessable by
  necessity, since possessing one grants real access, unlike a
  challenge id which only lets someone attempt a code they'd need to
  know anyway). 24-hour expiry, checked and self-cleaned on lookup.
- backend/store/userStore.js - added failedLoginAttempts: 0 and
  lockUntil: null to the initial user shape, plus
  incrementFailedLoginAttempts, resetFailedLoginAttempts,
  lockAccount.
- backend/services/otpService.js, backend/store/challengeStore.js,
  backend/services/mfaService.js, backend/utils/validators.js -
  unchanged; login's OTP step reuses otpService exactly as-is with
  channel: "email", no modifications needed.

Still not created: backend/middlewares/validateBody.js (still
unnecessary - validation still lives directly in controllers).

## Current API Endpoints

| Method | Path | Purpose | Auth required | Key Response Fields |
|---|---|---|---|---|
| GET | /api/health | Liveness check | none | { status: "ok" } |
| POST | /api/register | Create account, start email OTP | none | { msg, nextStep, challengeId, expiresAt, user } |
| POST | /api/send-email-otp | Resend email OTP (also reused for login OTP resend) | none | { msg, challengeId, expiresAt } |
| POST | /api/verify-email-otp | Verify email code; on success also starts SMS OTP | none | { msg, nextStep, challengeId?, ... } |
| POST | /api/send-sms-otp | Resend SMS OTP | none | { msg, challengeId, expiresAt } |
| POST | /api/verify-sms-otp | Verify mobile code | none | { msg, nextStep: "mfa-setup" } |
| POST | /api/change-mobile | Update number + fresh SMS OTP | none | { msg, mobile, challengeId, expiresAt } |
| POST | /api/mfa/setup | Generate TOTP secret + QR | none | { msg, qrCodeDataUrl, setupKey } |
| POST | /api/mfa/verify | Verify TOTP code | none | { msg, nextStep: "success" } |
| POST | /api/login | Validate credentials, start login MFA | none | { mfaRequired, method, userId, challengeId, expiresAt } or 423 if locked |
| POST | /api/verify-login-otp | Verify login OTP, create session | none (sets cookie on success) | { msg, nextStep: "dashboard" } + Set-Cookie: sid=... |
| GET | /api/me | Return authenticated user | session cookie | { id, fullName, email, mobile, ... } or 401 |
| POST | /api/logout | Destroy session | session cookie (optional) | { msg: "Logged out successfully" } |
| POST | /api/token | Issue a short-lived JWT (independent of session login) | none | { msg, token, expiresIn: "15m" } |
| GET | /api/protected | Demonstrate JWT verification | Authorization: Bearer <token> | { msg, user } or 401 |
| GET | /api/dev/last-otp | Test-only, disabled in production | none (gated by NODE_ENV) | { challengeId, otp } |

(The login/session/JWT rows are new this phase.)

## Current User Flow

Part 1 (unchanged): Registration -> Email OTP -> SMS OTP -> MFA
setup/QR/verify -> Success.

Part 2 (new): From the Success screen, "Continue to Login" now
actually navigates to the Login screen (previously a placeholder alert).

Login screen (email + password)
-> POST /api/login
-> wrong password or unknown email -> same generic "Invalid email or
  password" banner shown on the same screen (data-state="invalid")
-> 5th consecutive wrong password -> account locked 15 minutes, same
  banner but a different message, and even the correct password is
  rejected until the lock expires
-> correct password (account not locked) -> backend creates a fresh email
  OTP challenge and responds mfaRequired: true
-> frontend shows the Choose Method screen (Email OTP pre-selected,
  SMS OTP / Authenticator App visible but disabled)
-> Continue -> Login OTP screen (numeric keypad, not native keyboard)
-> user taps digits -> auto-verifies on the 6th -> POST
  /api/verify-login-otp
-> wrong code -> red banner + attempts remaining, boxes clear
-> expired -> "Code expired." banner, boxes clear/faded, but (unlike
  registration) the resend link stays visible with its own cooldown
  rather than swapping to a big button
-> correct code -> backend creates a session, sets the sid cookie ->
  frontend calls GET /api/me to prove the session actually works, then
  shows a confirmation (no full "dashboard" UI was built - see "Not Yet
  Implemented")

Side flow, not part of the visual journey: POST /api/token +
GET /api/protected demonstrate JWT issuance/verification as a
completely separate mechanism from the cookie-based login above - there
is no dedicated UI screen for this; it was tested directly via curl,
per the guidelines calling it out as its own thing to "demonstrate,"
not a UI-driven flow.

## Data Models / Storage

User (in userStore.js) - same shape as Part 1, with two new fields:
```js
{
  id: "u_1",
  fullName: "...",
  email: "...",
  mobile: "...",
  passwordHash: "...",
  emailVerified: true,
  mobileVerified: true,
  mfaEnabled: true,
  mfaSecret: "...",
  failedLoginAttempts: 0,   // NEW - resets to 0 on any successful login
  lockUntil: null,          // NEW - timestamp (ms); null unless currently locked
  createdAt: "..."
}
```

Challenge (challengeStore.js) - unchanged shape; login's OTP
challenge is just another row here with channel: "email", no
different from a registration-time email OTP challenge.

Session (sessionStore.js, in-memory Map) - NEW:
```js
{
  sessionId: "a1b2c3...(64 hex chars, crypto.randomBytes(32))",
  userId: "u_1",
  createdAt: 1737200000000,
  expiresAt: 1737286400000   // createdAt + 24 hours
}
```

## Important Technical Decisions

(Part 1's decisions - in-memory storage, bcryptjs over bcrypt, the
builds/routes vercel.json pattern, TOTP being a fundamentally
different model from OTP challenges, etc. - all still stand unchanged
and are not repeated here; see git history / prior versions of this
file if needed. Part 2's new decisions:)

- Login MFA uses Email OTP only, not whatever method was set up at
  registration (TOTP). The guidelines' own JSON example
  ({ mfaRequired: true, method: "email", challengeId }) already
  implies a server-decided, email-based method; the screenshot's
  "Choose Method" screen conflicts with that by showing user choice.
  Resolved the same way as MFA setup: show all three options, wire up
  only one (Email OTP, matching both the guideline's own example AND
  the screenshot's pre-selected default). This means a user's actual
  TOTP secret from registration is never used again during login in
  this build - flagging this clearly as a scope decision, not an
  oversight, since a "real" implementation would likely reuse whatever
  MFA method the user actually configured.
- "emailOrUsername" is looked up as an email only. This project
  never stores a separate username field, so the login field's label
  is aspirational relative to what's actually implemented. Flagged in
  code comments; not silently pretended to be more capable than it is.
- Failed-login lockout is a flat 5-attempts/15-minutes policy,
  hardcoded as constants, with no escalating backoff or per-IP tracking
  - a reasonable scope for this assignment, not a production-grade
    rate-limiting system.
- Session cookie Secure flag is conditional on NODE_ENV.
  Browsers reject Secure cookies over plain http, which local dev
  uses. This is a real, unavoidable consequence of testing over http
  locally, not a bug - see "Known Issues" for the fuller cross-origin
  cookie explanation and why the deployed Vercel URL (https,
  same-origin) is the more reliable place to test the full login
  session flow.
- /api/token and /api/verify-login-otp/session login are
  completely independent flows that both call bcrypt.compare
  separately. This was a deliberate non-optimization: the guidelines
  ask for session auth AND JWT auth to be demonstrated as genuinely
  separate mechanisms, so /api/token re-validates credentials from
  scratch rather than requiring an existing session, and never touches
  sessionStore at all.
- Session ids use crypto.randomBytes, unlike every other id in this
  project (u_1, ch_1, which are simple sequential counters). This
  is a deliberate, meaningful distinction: a session id, once issued,
  IS a user's access - it must be unguessable. A challenge id or user id
  being guessable doesn't grant anything on its own (you'd still need
  the actual OTP/password), so those were never a concern.
- Login OTP boxes are readonly and keypad-only, unlike every other
  OTP screen in this project (which accept native keyboard typing via
  setupOtpBoxAutoAdvance). This mirrors a real visual difference in
  the reference screenshots (login's OTP screens explicitly render an
  on-screen numeric keypad; registration's don't) rather than an
  arbitrary inconsistency.
- No dashboard/authenticated-application screen was built. The
  guidelines' login flow diagram ends at "Authenticated
  application/dashboard," but no such screen was ever shown in the
  reference screenshots, and building a full app shell was outside this
  assignment's actual scope (registration + login UI with all their
  states). Instead, on successful login OTP verification, the frontend
  calls GET /api/me and shows the result in a simple confirmation -
  this proves the entire session mechanism genuinely works end-to-end,
  without inventing a UI that was never asked for.
- Login's desktop layout was NOT built to match the reference's
  gradient-sidebar design. The Login reference screenshots show a
  visually distinct desktop treatment (a colored gradient side panel)
  from Registration's desktop treatment (top header + step indicator).
  Given time constraints, Login screens currently just use the same
  centered-card mobile-first layout at all widths, with the desktop
  chrome (header/footer) from Part 1 applying generically. This is a
  known, explicit visual gap - see Known Issues.

## Concepts Learned

(Part 1's concepts - OTP, TOTP, QR codes, bcrypt/bcryptjs, CSS grid-area
positioning, etc. - still stand; not repeated. Part 2's new concepts:)

- Sessions vs. tokens as two different authentication models:
  a session is server-side state (the session store holds the truth;
  the cookie is just a pointer to it, so revoking access means deleting
  server-side data) vs. a JWT being self-contained (the token itself
  carries the claim, and the server only verifies a signature - there's
  no server-side "list of valid tokens" to check, which is why JWTs
  can't be individually revoked before their expiry without extra
  infrastructure like a blocklist, which this project doesn't build).
- Why cookies need HttpOnly, and what that actually protects
  against: JavaScript running on the page (including malicious
  injected scripts, i.e. XSS) cannot read an HttpOnly cookie's value
  at all - the browser sends it automatically on requests, but
  document.cookie never exposes it.
- Why CORS and cookies interact differently than CORS and normal
  data: a wildcard Access-Control-Allow-Origin: * is explicitly
  disallowed by browsers whenever a request also wants cookies
  (credentials: include) - you must echo back a specific origin
  instead, which is why cors() had to change from its Part 1 default
  once login introduced cookies.
- Account lockout as a brute-force defense: locking after N failed
  attempts trades a small inconvenience (a legitimate user mistyping
  their password 5 times gets locked out too) for meaningfully slowing
  down credential-guessing attacks - a real, standard security
  trade-off, not a purely theoretical one.
- Never revealing which part of a login was wrong: returning the
  identical message for "no such email" and "wrong password" prevents
  an attacker from using the login endpoint to build a list of which
  emails are registered (user enumeration).
- Why /api/token re-validates credentials instead of trusting an
  existing session: keeping the two auth mechanisms fully independent
  makes each one's security properties easier to reason about on its
  own, rather than one silently depending on internal details of the
  other.

## Known Issues

(Part 1's known issues about the max-attempts screen, the 900px
breakpoint choice, and no browser-rendered visual verification all
still apply and are not repeated here.)

- This phase has NOT been redeployed to Vercel yet. Everything
  described above was built and tested locally only. The live
  *.vercel.app URL still reflects the pre-Part-2 code until this is
  pushed and redeployed.
- JWT_SECRET must be added to Vercel's environment variables
  before Part 2 will work on the deployed site at all - /api/token
  and /api/protected will throw/fail without it. This is a new
  required env var (see Environment Variables below), not something
  that carries over automatically from local .env.
- Session cookies may not work reliably in the local split-port dev
  setup (frontend on :5500 via Live Server, backend on :5000).
  This is a genuine, real technical constraint, not an oversight:
  cross-origin cookies need SameSite=None; Secure, but Secure
  cookies are rejected by browsers over plain http, which local dev
  uses. The code sets secure: false locally so the cookie can still be
  set at all, but some browsers may still be inconsistent about sending
  a SameSite=Lax-with-secure:false cookie back on a cross-origin
  fetch(). Recommendation: test the full login -> session -> /api/me
  flow on the deployed Vercel URL (https, same-origin, no cross-origin
  cookie issues at all) rather than the local two-terminal setup used
  for registration testing. Registration/OTP/MFA testing is unaffected,
  since none of that ever used cookies.
- No dashboard screen exists - login success shows a confirmation
  alert (proving GET /api/me works) rather than a real authenticated
  app view. Flagged as a deliberate scope decision above, not a
  forgotten piece.
- Login's desktop layout doesn't match the reference's gradient
  sidebar design - it reuses the same centered-card layout as every
  other screen instead. Explicit, known visual gap - see Important
  Technical Decisions.
- "Remember me" checkbox is currently visual only - it doesn't
  extend the session's 24-hour duration or otherwise change behavior.
  The guidelines list it as a UI element to include but don't specify
  backend semantics for it, so nothing was invented.
- "Forgot password" and "Continue with Google" are explicit
  placeholders (a clear alert on click), not silently broken links -
  neither a password-reset flow nor OAuth integration was ever in scope
  for this assignment.
- Account lockout has no admin/manual unlock mechanism - a locked
  account simply has to wait out the 15-minute lockUntil timestamp.
  Fine for demonstrating the concept; not production-grade account
  recovery.
- None of Part 2's frontend screens have been visually verified in an
  actual browser by the AI, for the same reason as Part 1 (no
  headless browser available in this sandbox) - verified instead via
  DOM-id cross-checking (all 70 getElementById calls resolve), HTML
  tag balance, CSS brace balance, and a complete backend regression
  test covering the entire Part 1 + Part 2 journey via curl.

## Not Yet Implemented

- Redeployment of this phase's code to Vercel (see Next Implementation
  Step).
- A real authenticated dashboard/application screen (explicitly out of
  scope - see Important Technical Decisions).
- SMS OTP and Authenticator App as functional login-MFA methods (shown,
  disabled, per the established pattern).
- Password reset / "Forgot password" flow.
- Google OAuth ("Continue with Google").
- Login's desktop gradient-sidebar visual design.
- Any backend semantics for "Remember me."
- Rate limiting beyond the per-account lockout (e.g. no IP-based
  throttling).
- backend/middlewares/validateBody.js (still not needed).

## Next Implementation Step

Visually verify Part 2 in a real browser, then redeploy.
Concretely: (1) run locally and click through every login screen and
state (default, invalid credentials, account lockout after 5 attempts,
choose method, OTP default/wrong/expired, keypad behavior) comparing
against the reference screenshots; (2) test the session flow
specifically - given the cross-origin cookie caveat above, this is most
reliably done either by testing on the already-deployed Vercel URL after
redeploying, or by temporarily serving the frontend from the Express
backend itself (same-origin) for local testing purposes; (3) add
JWT_SECRET to Vercel's project environment variables (Settings ->
Environment Variables - same place NODE_ENV was added before); (4)
commit and push this phase's changes, triggering a Vercel redeploy; (5)
re-run the full manual testing checklist against the live URL, including
the complete Part 1 + Part 2 journey end to end. After that's confirmed,
the entire assignment (Part 1 + Part 2) is functionally complete, and
what remains is purely visual/optional polish (the login desktop
gradient design) unless directed otherwise.

## How To Run (local development)

From the secureid/ project root:

```
npm install
npm run dev
```

This starts the backend at http://localhost:5000.

Open frontend/index.html directly, or serve it via Live Server (or
similar) on a different port such as :5500.

For registration/OTP/MFA testing: the existing two-terminal setup
works exactly as before.

For login/session testing: due to the cross-origin cookie caveat
above, prefer testing against the deployed Vercel URL once redeployed.
If testing locally is necessary, be aware the session cookie may not
persist across the two different local ports in all browsers.

## Environment Variables

| Name | Purpose | Required? |
|---|---|---|
| PORT | Port the backend listens on locally | Optional, defaults to 5000 |
| NODE_ENV | Disables /api/dev/last-otp when "production"; also affects session cookie Secure flag | Optional locally; must be "production" on Vercel |
| JWT_SECRET | Signs and verifies JWTs (/api/token, /api/protected) | NEW, required - set locally in .env (a dev-only placeholder value is already there) and must be added to Vercel's environment variables before Part 2 works in production |

## Testing Status

Tested manually (via curl), passing, this phase - the full combined
Part 1 + Part 2 journey in one continuous run:
- Register -> verify email OTP -> verify SMS OTP -> MFA setup -> verify TOTP
  (via independently-computed pyotp code) -> account now has
  mfaEnabled: true.
- Login with wrong password -> generic invalid-credentials message.
- Login with a nonexistent email -> the exact same generic message (no
  enumeration).
- Login with correct credentials -> mfaRequired: true + a real email
  OTP challenge (confirmed via the dev-only OTP endpoint).
- Login OTP: wrong code -> attemptsRemaining decrements; correct code
  -> session created, Set-Cookie: sid=... observed directly in the
  response headers (64 hex characters, HttpOnly flag present).
- GET /api/me without a cookie -> 401; with the valid cookie -> correct
  user data returned.
- POST /api/logout -> session deleted; the SAME cookie immediately
  stops working on a subsequent /api/me call -> 401 again.
- 5 consecutive wrong-password attempts on a separate test account ->
  account locked on the 5th; a 6th attempt with the CORRECT password is
  still rejected with 423 accountLocked: true.
- POST /api/token with correct credentials -> a real signed JWT
  returned.
- GET /api/protected without a token -> 401; with a garbage/invalid
  token -> 401; with the real issued token -> 200 with user data.

Not yet tested:
- Anything in an actual browser (see Known Issues) - the entire list
  above was verified via curl/backend only.
- The numeric keypad's actual click behavior, the Choose Method screen's
  visual selection state, and the Login screen's invalid-credentials
  banner rendering - all built and reasoned through, not click-tested.
- The full flow against the deployed Vercel URL after redeployment.

## Git State

Recommended commit message for this phase:

```
feat: implement Part 2 - Login, session auth, and JWT auth

Backend:
- Add POST /api/login (credential validation, generic error messages,
  5-attempt/15-minute account lockout, triggers email OTP for MFA)
- Add POST /api/verify-login-otp (reuses otpService, creates session on success)
- Add backend/store/sessionStore.js (crypto.randomBytes session ids, 24h expiry)
- Add backend/middlewares/requireSession.js and requireJwt.js (two
  independent auth mechanisms, as required by the guidelines)
- Add GET /api/me (session-protected) and POST /api/logout
- Add POST /api/token and GET /api/protected (independent JWT flow,
  re-validates credentials from scratch, never touches sessionStore)
- Add cookie-parser middleware; update CORS to { origin: true, credentials: true }
- Add failedLoginAttempts/lockUntil fields and helpers to userStore.js
- Add cookie-parser and jsonwebtoken dependencies; add JWT_SECRET env var

Frontend:
- Add Login screen (default + invalid-credentials states)
- Add Choose Method screen (Email OTP wired up; SMS/Authenticator shown, disabled)
- Add Login OTP screen with on-screen numeric keypad (default/wrong/expired)
- Wire "Continue to Login" and "Login" links to actually navigate
- Add loginUser/verifyLoginOtp/fetchMe/logoutUser to api.js (all use
  credentials: "include" for the session cookie)

Verified end-to-end via curl: the complete Part 1 + Part 2 journey in one
continuous run, including session creation/destruction and independent
JWT issuance/verification. NOT yet visually verified in a browser, and
NOT yet redeployed - see PROJECT_CONTEXT.md Next Implementation Step.
```

## AI HANDOFF INSTRUCTIONS

### Instructions for the next AI

1. Read this file first, in full, before doing anything else.
2. Inspect the actual current project files on disk - verify against
   real code, don't assume this document is perfectly up to date.
3. Do NOT recreate or rewrite anything listed under "Completed
   Features" unless the developer explicitly asks for a change.
4. Do NOT change the established architecture (in-memory storage, no
   database, no React, vanilla HTML/CSS/JS, two independent auth
   mechanisms for session vs. JWT, Email-OTP-only for login MFA,
   Authenticator-App-only for registration MFA) without explaining why
   and getting explicit approval first.
5. Continue from "Current Phase" and follow "Next Implementation Step"
   exactly - do not skip ahead (e.g. building a dashboard, adding OAuth,
   building the login desktop gradient design) without direction.
6. Preserve the existing coding style: camelCase naming, routes contain
   only routing, controllers contain request/response + validation
   logic, try/catch around all async controller code, consistent
   { msg, ... }-style JSON responses, small named validator functions.
7. Ask before making any major architectural change.
8. This project is for an internship assignment where the developer
   must personally explain and, in one required phase, live-code
   changes without AI assistance. Optimize every explanation and every
   piece of code for the developer's understanding, not minimal code or
   maximum sophistication.
9. Pay special attention to the cross-origin cookie caveat documented
   under "Known Issues" and "How To Run" - if session-based login
   appears to "not work" locally, check that explanation before
   assuming the code is broken.
10. After completing a phase, update this file to reflect the ACTUAL
    current state of the project - do not describe future or planned
    work as if it is already implemented.
