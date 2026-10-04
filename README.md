# EstateHub

EstateHub is a full-stack real-estate marketplace with three roles — **Buyer**, **Agent**,
and **Admin** — built as a React single-page frontend backed by an Express + PostgreSQL (Neon) API.

This README describes the project as it currently stands. It replaces the old
`estatehub-react/README.md`, which only covered the frontend and predates the backend.

## Roles

- **Buyer** — browse/search properties, save favorites, compare listings, track recently
  viewed properties, message agents, send inquiries, and request appointments.
- **Agent** — manage listings ("My Listings"), respond to inquiries and messages, manage
  appointments, go through license verification and renewal, and collect reviews.
- **Admin** — moderate properties, manage users, review agent verification and license
  renewal submissions, configure notification settings, and view the audit log.

Role is enforced server-side on every protected route (`authenticate` + `authorize(role)`
middleware) — the frontend hiding a button is a UX convenience, not the security boundary.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (Vite), React Router 6, Tailwind CSS |
| Backend | Node.js, Express |
| Database | PostgreSQL — Neon in production (via `pg`) |
| Auth | JWT access token + refresh token (HTTP-only cookie) |
| Email | Gmail SMTP (via `nodemailer`), console fallback in development |
| Uploads | `multer`, local disk (`server/uploads/`) — see storage limitation below |
| Backend tests | Node's built-in test runner (`node --test`) |

## Folder structure

```
EstateHub website/
├── estatehub-backend/
│   ├── database/
│   │   ├── schema.sql              # base schema
│   │   ├── migrations/             # incremental schema changes, run after schema.sql
│   │   └── seeds/                  # reference/lookup data (property types, amenities, locations, ...)
│   └── server/
│       ├── src/
│       │   ├── config/             # env loading, DB pool, upload paths
│       │   ├── controllers/        # request handlers
│       │   ├── middleware/         # auth, authorization, upload handling/guards, rate limiting
│       │   ├── models/             # SQL queries
│       │   ├── routes/             # Express routers
│       │   ├── utils/              # email, password hashing, JWT, upload safety checks, etc.
│       │   └── validators/         # express-validator rule sets
│       ├── tests/                  # backend test suite
│       ├── uploads/                # runtime file storage (avatars/documents/properties) — empty in source
│       ├── .env.example
│       └── server.js
└── estatehub-react/
    ├── src/
    │   ├── api/                    # fetch wrappers per backend resource
    │   ├── pages/                  # one component per route
    │   └── App.jsx                 # route table
    └── .env.example
```

## Prerequisites

- Node.js 18+
- A PostgreSQL database: a free [Neon](https://neon.tech) project, or a local PostgreSQL 14+
- (Optional, for real email delivery) a Gmail account with an **App Password**

## 1. Database setup

EstateHub runs on PostgreSQL (Neon in production). The schema lives in
`estatehub-backend/database/postgres/migrations/` and is applied by a script — the API never creates tables itself.

```bash
cd estatehub-backend/server
cp .env.example .env          # then set DATABASE_URL (Neon connection string, or postgresql://postgres:...@localhost:5432/estatehub)
npm install
npm run db:migrate            # create all 29 tables, indexes, constraints, triggers
npm run db:seed               # property types, amenities, locations, notification settings (safe to re-run)
npm run db:verify             # read-only structural check + row counts
```

Coming from the previous MySQL version? The original MySQL files (`database/schema.sql`, `migrations/`, `seeds/`) are kept for
reference and for the one-time copy of existing data: `npm run db:import-mysql` (rehearsal by default; add `-- --apply` to commit).
See `DEPLOYMENT.md` §1 for the full, step-by-step Neon procedure. Never run an import into a database that already holds data you care about —
the importer refuses non-empty targets.

## 2. Backend setup

```bash
cd estatehub-backend/server
cp .env.example .env
# edit .env: at minimum set DATABASE_URL and both JWT secrets
npm install
npm run dev        # or: npm start
```

The server validates required environment variables on boot and exits with a clear error
if any are missing (see `src/config/env.js`).

### Gmail SMTP setup (optional)

Forgot-password emails work without this — they're logged to the console in development.
To send real emails:

1. Enable 2-Step Verification on the Gmail account.
2. Create an **App Password** (Google Account → Security → App passwords).
3. Set `GMAIL_USER` to the Gmail address and `GMAIL_PASS` to the 16-character app password
   (not the account's real password) in `.env`.
4. Optionally set `EMAIL_FROM` to override the sender display name/address.

Resend was previously supported as an alternate provider; that code path has been removed
since Gmail is the intended provider. Only Gmail and the development console fallback remain.

## 3. Frontend setup

```bash
cd estatehub-react
cp .env.example .env
# edit .env if your backend isn't at http://localhost:5000/api
npm install
npm run dev
```

Production build:

```bash
npm run build      # outputs to estatehub-react/dist/ (not committed to source control)
npm run preview
```

In production builds `VITE_API_URL` should be **unset**: the app then calls the same-origin `/api`. A `VITE_API_URL` that points at
localhost/127.0.0.1 is ignored (with a build-log warning), and `npm run build` fails if the finished bundle still contains
`localhost:5000`. Only set `VITE_API_URL` in production to point at a *different, public* API host.

## Backend tests

```bash
cd estatehub-backend/server
npm install
npm test
```

**VERIFIED BY AUTOMATED TEST**, on the person's own machine, Node v24.12.0 (2026-09), after this
cleanup pass's code changes: **89 passing, 0 failing, nothing else listed.** (An earlier run of
`npm test` on this same codebase briefly showed a 90th, failing "test" — `node --test`'s default
file discovery had wrongly swept up the smoke-test script below, because its old filename matched
the `*-test.js` pattern; the script correctly refused to run without `SMOKE_CONFIRM=yes`, which
`node --test` reported as a failure. Fixed by renaming it to `scripts/smoke.js`, which matches none
of `node --test`'s default discovery patterns, confirmed by a clean re-run.)

## Known issue fixed: server was unreachable on 127.0.0.1 on some Windows setups

`server.js` used to call `app.listen(env.port, ...)` with no host, which node/libuv resolves to the
IPv6 wildcard (`::`). On at least one Windows + Node 24 setup this meant `http://localhost:PORT`
worked (`localhost` resolved to `::1`) while `http://127.0.0.1:PORT` got `ECONNREFUSED` — nothing
was actually listening on the IPv4 interface. Fixed by binding explicitly to `0.0.0.0`, which
accepts both and is also what most hosting platforms/containers require. If you were relying on
`localhost` and it worked before, nothing changes for you; if anything hit 127.0.0.1 directly and
failed, it should work now.

## Live smoke / security test (real backend + real database)

`npm test` uses in-memory fakes. `estatehub-backend/server/scripts/smoke.js` is a separate script
that exercises a **running** backend and its **real** PostgreSQL database (ported from MySQL during the Neon migration —
**not yet run against PostgreSQL**; the results quoted below are from the earlier MySQL era): registration/login, JWT tampering,
refresh-token rotation and reuse, logout, role authorization (buyer/agent/admin), buyer-cannot-create-property,
Agent B vs Agent A ownership (edit, amenities, delete, image upload), the cross-role listing flow,
appointments (UTC storage), password reset (hashed, expiring, single-use), suspension, private
verification documents, upload/path-traversal defenses, PostgreSQL timezone behavior (UTC, Asia/Karachi, America/New_York sessions), and
a scan for backend secrets in the frontend.

```bash
# terminal 1
cd estatehub-backend/server && npm start
# terminal 2 (use a DEVELOPMENT database: the script writes test users and a test listing)
cd estatehub-backend/server
SMOKE_CONFIRM=yes SMOKE_ADMIN_EMAIL=admin@example.com SMOKE_ADMIN_PASSWORD='...' npm run smoke
```

- Without admin credentials every admin-dependent check is reported `SKIP`, never `PASS`.
  Suspension and approval need a `super_admin` (approval also works for `moderator`).
- Optional: `SMOKE_MODERATOR_EMAIL/PASSWORD` and `SMOKE_SUPPORT_EMAIL/PASSWORD` enable the permission-level checks.
- Login/register/refresh/forgot/reset share one limiter (20 per 15 min per IP) and a run uses about 17.
  If a run is rate-limited the affected checks show `BLOCKED`; restart the backend or wait 15 minutes.
- It refuses to run unless `SMOKE_CONFIRM=yes` and refuses when `NODE_ENV=production`.
- For server-zone independence, run it twice: backend started with `TZ=UTC` and again with `TZ=Asia/Karachi`.
- `SMOKE_REPORT=report.json` writes a machine-readable report. Cleanup SQL is printed at the end.

**Historical result — run against a real backend and real MySQL 8.0.45 (2026-09), before the PostgreSQL migration:** first run found 2 real bugs (see
"Timezone policy" above — the password-reset-token SQL had the same session-timezone flaw already
fixed once in refresh tokens) and, along the way, a real server-startup bug (`server.js` had no
explicit bind host, which left the server reachable at `http://localhost:PORT` but refusing
connections at `http://127.0.0.1:PORT` on at least one Windows + Node 24 setup — fixed by binding
explicitly to `0.0.0.0`). Both were fixed; a second run against the same real backend and MySQL
confirmed **82 pass, 0 fail, 14 skip, 3 info** — the 14 skips are all admin-dependent checks
(supply `SMOKE_ADMIN_EMAIL/PASSWORD`, and ideally `SMOKE_MODERATOR_*`/`SMOKE_SUPPORT_*`, to cover
those too).

Running the script twice back-to-back (within the shared 20-per-15-min auth rate limit) surfaced a
real gap in the script itself, not the app: once registration got rate-limited (correctly reported
as `BLOCKED`), several later checks that assumed registration had succeeded threw confusing
`Cannot read properties of undefined` errors instead of a clean `SKIP`. Fixed by adding an
early-return guard to each of those checks. If you see `BLOCKED` entries for registration, expect
(now) clean `SKIP`s below them, not crashes — restart the backend or wait 15 minutes before
re-running for a clean full pass.

`npm audit` on this project currently reports 7 vulnerabilities (1 critical, 2 high, 4 moderate) in
dependencies. Review `npm audit` output before deciding between `npm audit fix` (safe, no breaking
changes) and `npm audit fix --force` (may bump major versions) — neither was run as part of this
cleanup pass.

## Password reset flow

1. Buyer/Agent submits their email on Forgot Password.
2. The response is identical whether or not the email exists (no account enumeration),
   even if email delivery itself fails.
3. A single-use, hashed reset token is generated and emailed (or logged to console in dev).
4. The reset link opens Reset Password, which accepts the raw token, verifies it against
   the hash, checks expiry, and invalidates the token after use.

## Accessibility and responsive notes (this cleanup pass)

Static code review only — nothing below was checked in an actual browser or screen reader:

- Public pages (Home, Browse Properties, Property Details, Find an Agent, Agent Profile) had no
  working mobile navigation — the desktop nav was `hidden` below `md`/`lg` with no replacement.
  Added `src/components/PublicNavMenu.jsx` (a real hamburger button with `aria-expanded`,
  Escape-to-close, and focus return) to all five.
- `FindAnAgent.jsx` had a second mobile "sidebar" with no open/close toggle at all — it was
  permanently fixed on screen on every mobile viewport, overlapping content. Removed (the new
  hamburger menu replaces it). `Home.jsx` had a similar drawer that was unreachable (no toggle
  ever opened it); also removed as dead code.
- Fixed heading hierarchy: all four auth pages (SignIn, Register, ForgotPassword, ResetPassword)
  rendered a decorative `<h2>` before the page's real `<h1>`; the decorative one is now a `<p>`.
  The listing form rendered two `<h1>`s at once when editing ("Edit listing" + the step heading);
  the first is now an `<h2>`.
- Added `aria-label`/`htmlFor` to ~20 previously unlabeled search boxes, filter selects, and
  textareas (Browse Properties, Find an Agent, Home, Manage Properties, Manage Users, Audit Log,
  Agent Inquiries, My Listings, Property Details, Agent Profile), and converted two icon-only
  star-rating pickers to a proper `role="radiogroup"`.
- Browse Properties' Price/Beds & Baths/Type dropdown panels could overflow past the right edge
  of a narrow (390px) viewport; constrained with `max-w-[calc(100vw-2rem)]` and left-anchored them.
- The listing form's Beds/Baths/Sq. Ft. row now stacks on narrow screens instead of always forcing
  3 cramped columns.
- Not done: an actual pass with a screen reader or at real breakpoints (390/820/1280px) in a
  browser, focus-trap testing inside the admin/agent modals, and color-contrast checking.

## Timezone policy

> **Superseded by the PostgreSQL migration.** The notes below describe the MySQL implementation (session pin, `FROM_UNIXTIME`,
> `dateStrings`) and are kept as history. On PostgreSQL: token/audit/created_at columns are `TIMESTAMPTZ` (absolute instants, so no
> session-zone pin is needed); `appointments.scheduled_at` is `TIMESTAMP` holding UTC digits written/read as explicit UTC strings;
> `NOW() + interval` / `to_timestamp()` replace the MySQL idioms; and `src/config/dbHelpers.js` makes `pg` return DATE/TIMESTAMP
> values as the same `'YYYY-MM-DD'` / `'YYYY-MM-DD HH:MM:SS'` (UTC) strings the API has always returned. `database/verify_timezone.sql`
> applies to MySQL only.

- Every MySQL connection is pinned to session `time_zone = '+00:00'` (UTC) in `src/config/db.js`,
  so `NOW()`, `FROM_UNIXTIME()` and `TIMESTAMP` columns are UTC regardless of the server's OS zone.
  API date strings (`dateStrings: true`) are therefore UTC. **VERIFIED BY AUTOMATED TEST against
  real MySQL** (`scripts/smoke.js` section 9, run against MySQL 8.0.45): confirmed all pooled
  connections report session `time_zone = +00:00`.
- Password-reset tokens and refresh tokens are both written with `FROM_UNIXTIME(UNIX_TIMESTAMP() +
  N)` and compared with `expires_at > NOW()` — an idiom that is correct independent of session
  time_zone (not just because of the UTC pin above). An earlier version of both models instead used
  `DATE_ADD(UTC_TIMESTAMP(), ...)` / `expires_at > UTC_TIMESTAMP()`, on the reasoning that using
  UTC_TIMESTAMP() on both the write and the read would make the session's offset cancel out. It does
  not: `UTC_TIMESTAMP()` always returns true-UTC clock digits regardless of session time_zone, but a
  `TIMESTAMP` column reinterprets whatever literal it's given as session-local time when converting
  it to the UTC instant actually stored — so under a non-UTC session, the write silently shifts the
  real stored expiry by the session's offset while the read-side comparison is exact, with no
  cancellation. **CONFIRMED BY AUTOMATED TEST against real MySQL, with real numbers**:
  `scripts/smoke.js` found the refresh-token version of this bug under a live +05:00 session before
  it was fixed (a token meant to last 30 more minutes was already expired), and reproduced the same
  corruption for the reset-token idiom (a token meant to last 30 more minutes showed -16200s / -4.5h
  left under +05:00, and +19800s / +5.5h left under -05:00) before that one was fixed too. Both are
  now fixed to the session-independent idiom and **VERIFIED BY AUTOMATED TEST against real MySQL in
  three sessions (+00:00, +05:00, -05:00)** — this is not just protected by the UTC pin above
  anymore; either fix would work with no pin at all.
- Appointments: `appointments.scheduled_at` is a `DATETIME` always written/read as explicit UTC strings
  by JavaScript (`src/utils/appointmentRules.js`); it does not depend on the session zone. Column type
  confirmed via `scripts/smoke.js` against real MySQL; behavior itself was not separately re-verified
  in this pass (the 89/89 automated test suite already covers `parseScheduledAt` and the UTC
  round-trip with an in-memory store — see `appointment.controller.test.js`).
- The 89-test automated suite uses in-memory token stores for speed, so it cannot catch SQL-level
  timezone bugs like the one above by itself — that gap is exactly what `scripts/smoke.js` section 9
  and `database/verify_timezone.sql` exist to cover, against a real MySQL server.

## Upload behavior and production storage limitation

Uploaded files (avatars, property photos, agent verification/license documents) are written
to `server/uploads/<kind>/` on local disk; the directories are created automatically at
startup if missing. **This is fine for local development but is not safe to rely on in
production** if the backend runs on an ephemeral host (most PaaS platforms wipe local disk
on redeploy/restart) — uploaded files would be lost. Before a real production deployment,
migrate storage to an object store such as **Cloudflare R2** or any S3-compatible service.
Verification/license documents are privacy-sensitive; whatever storage is used, they must
stay behind authenticated/authorized access, never a public bucket or public URL.

Uploads are validated by magic-byte checks (not just file extension) — see
`src/utils/uploadSafety.js` — and served through path-safe lookups; see
`src/middleware/uploadGuards.js`.

## Role/admin setup

Public registration only creates Buyer or Agent accounts (enforced server-side). Creating listings (`POST /api/properties`) is limited to Agents and Admins; buyers receive 403. There is no
self-service admin signup by design — an Admin account must be created directly in the
database (e.g. inserting a user row with `role = 'admin'` and a bcrypt-hashed password) or
through a separate internal process you control. Do not expose an admin-creation API publicly.

## Currency

All prices in the current UI and API are plain numeric values displayed with a `$` prefix.
There is no multi-currency architecture (no currency field, no conversion, no exchange
rates) — USD-style formatting is applied uniformly as a display convention, not converted
from any other currency. Treat this as a known product limitation if multi-currency support
is ever required, rather than a case for adding client-side conversion (which would need a
live exchange-rate source and rounding/rate-risk handling this project doesn't have).

## Known limitations

- Local-disk uploads are not durable on an ephemeral production host (see above).
- No independent object storage, image resizing/CDN, or map provider is wired in yet.
- Single currency, no localization.
- This cleanup pass itself was done without network access, so `npm install`, `npm test`,
  `vite build`, and testing against a live MySQL instance were not run by the person doing the
  cleanup. **Since then, the person using this project has run `npm install` and `npm test`
  (89/89 passing, Node v24.12.0) and `scripts/smoke.js` against a real backend and real MySQL
  8.0.45 (82 pass / 0 fail / 14 admin-dependent skips — see "Live smoke / security test" and
  "Timezone policy" above), which caught and led to fixing two real bugs. A real `npm run build`
  (Vite 5.4.21) has also been run and succeeded** — 116 modules, no errors, 24s build time. Vite
  warns that the single JS bundle is ~530 kB (128 kB gzipped) and suggests code-splitting; that's
  advisory, not an error, and hasn't been acted on since it wasn't part of the original scope — say
  the word if you want that addressed. Still not run by either party as of this writing: a
  browser-based responsive/accessibility pass and the admin-dependent smoke checks (needs
  `SMOKE_ADMIN_EMAIL/PASSWORD`).

## Security notes

- JWT access tokens are short-lived; refresh tokens are stored as an HTTP-only cookie and
  are rotated/revocable.
- Password reset tokens are single-use and stored hashed, never in plaintext.
- Role checks are enforced in Express middleware on every protected route, not just hidden
  in the UI.
- Real secrets belong only in `server/.env`, which is git-ignored and must never be
  committed or shared. Use `.env.example` (placeholders only) as the reference for which
  variables exist.
