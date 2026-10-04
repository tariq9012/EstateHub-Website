# EstateHub — deployment guide (Vercel Services + Cloudflare R2 + Neon PostgreSQL)

**One Vercel project, one public origin**, built from this repository with Vercel Services:

```
https://<your-project>.vercel.app/        → React/Vite frontend   (service "estatehub-react")
https://<your-project>.vercel.app/api/*   → Express backend       (service "server")
```

| Part | Where |
|---|---|
| Frontend (React/Vite) + backend (Express) | ONE Vercel project, two services, routed by the root `vercel.json` |
| Database | Neon PostgreSQL (serverless Postgres; `DATABASE_URL`) |
| Files | Cloudflare R2: one **public** bucket, one **private** bucket |
| Email | Gmail SMTP (unchanged) |

> **Never paste secrets into chat or commit them.** Type R2, database, JWT and Gmail values directly into
> Vercel → Project → Settings → Environment Variables.

---

## 0. How the pieces fit

**Routing (root `vercel.json`).** `/api/(.*)` is listed first and goes to the Express service; everything else goes to
the frontend service. Per Vercel's Services docs a service receives the **original** request path (the matched part is not
stripped), and Express already mounts all routes under `/api` (`app.use('/api', …)`), so `GET /api/health` reaches
Express as `/api/health` — there is no `/api/api`. The frontend service has its own SPA fallback so `/sign-in`, `/property-details/12`,
`/reset-password?token=…`, `/admin-dashboard` … work when opened or refreshed. The `/api` rewrite is evaluated first, so the fallback never intercepts API calls.

**The SPA fallback is deliberately narrow:** `/((?!@|__|src/|node_modules/|assets/)[^.]*)` → `/index.html`. It rewrites only *route-shaped* paths
(no dot in the path; not `@…`, `__…`, `src/`, `node_modules/` or `assets/`). A catch-all `/(.*)` or `/((?!assets/).*)` also matches Vite's development
modules (`/@vite/client`, `/@react-refresh`, `/src/main.jsx`). In production that is harmless (Vercel serves real files from `dist` before rewrites), but under `vercel dev` no
built files exist, so those module requests were rewritten and the page stayed blank. React routes here never contain a dot, so none are affected.

**Same origin ⇒ simpler auth.** The browser calls `/api/...` on the same origin it was loaded from. Production builds of the
frontend default to `/api` (`src/api/apiClient.js`); `VITE_API_URL` is only for local development. Because the refresh cookie is
first-party, use `COOKIE_SAMESITE=lax`, `COOKIE_SECURE=true` and **no** `COOKIE_DOMAIN` (host-only cookie, the safest scope; cookie path `/api/auth`).
CORS is no longer involved for site→API calls (same origin); the allowlist remains for local development and an optional custom domain.
`POST /api/auth/refresh` and `/api/auth/logout` still reject any request whose `Origin` header is not on the allowlist (CSRF guard); on Vercel
the project's own production and deployment hostnames (`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`) are added automatically, plus `FRONTEND_URL`.

**Service bindings: none required.** The React app runs in the visitor's browser and reaches the API through the public same-origin
`/api` route. The frontend service has no server-side code (static Vite build, no SSR/functions), so nothing calls the Express
service from inside Vercel. Adding a binding would only create an unused internal URL.

**Direct browser → R2 uploads.** Vercel Functions reject request bodies over **4.5 MB**, and EstateHub accepts 5 MB photos (up to 20 per request)
and 10 MB documents, so files never pass through the API: the API authorizes and presigns, the browser PUTs to R2, then the API re-checks the real
bytes (size, magic bytes, declared type) before saving anything. Details: `src/services/storage/r2Driver.js`.

**Two buckets.** Cloudflare can only make a whole bucket public, so photos live in a public bucket and verification/renewal documents in a private bucket
that is never public. The database stores a public URL for photos and a bare key for private documents (no schema change).

---

## 1. Neon PostgreSQL

The backend talks to PostgreSQL through the `pg` driver with one small connection pool per function instance (2 connections on Vercel).
The old MySQL database is **not touched** by any step below — keep it until §1.8 says it is safe to retire.

**1.1 Create the Neon project.** [neon.tech](https://neon.tech) → *Create project* → pick the Postgres version and a region close to your Vercel functions
(Vercel → Settings → Functions → Function Region; keep them in the same region to cut latency). Name the database e.g. `estatehub`.

**1.2 Copy the connection string.** Neon Dashboard → *Connect*. Use the **pooled** string (host contains `-pooler`) for Vercel — it survives many short-lived
function instances. Neon shows `?sslmode=require` at the end; change it to `?sslmode=verify-full` (full certificate + hostname verification, stated explicitly
so a future `pg` major version cannot silently weaken it; Neon's certificates are publicly trusted, so no CA file is needed). It looks like
`postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/DBNAME?sslmode=verify-full`.
For `npm run db:migrate` you may use the same pooled string, or Neon's *direct* (non-pooler) string if you prefer — both work.
Type it only into your private `.env` and Vercel's settings — never into chat, git, tests or docs.

**1.3 Add `DATABASE_URL` to Vercel.** Vercel → Project → Settings → Environment Variables → `DATABASE_URL` = the string from 1.2, scope **Production**
(Preview: a separate Neon *branch* string, never the production one). Mark it *Sensitive*. Delete the old `DB_*` variables (§4).

**1.4 Create the schema (once, from your computer).**
```bash
cd estatehub-backend/server
npm install                      # installs `pg` (see "Dependencies" below)
# put DATABASE_URL=... in estatehub-backend/server/.env  (this file is git-ignored)
npm run db:migrate               # applies database/postgres/migrations/*.sql in one transaction per file
npm run db:seed                  # property types, amenities, locations, notification settings (idempotent)
npm run db:verify                # read-only: 29 tables, 47 foreign keys, 14 triggers, indexes, sequences, row counts
```
`db:migrate -- --status` lists applied/pending migrations. The API never creates or alters tables by itself.

**1.5 Copy your existing MySQL data (one time).** Skip this only if you want an empty production database.
```bash
# .env (temporarily): MYSQL_SOURCE_URL=mysql://USER:PASSWORD@HOST:3306/DBNAME    (read-only; only SELECTs are sent)
#                     DATABASE_URL=<Neon>
npm run db:import-mysql            # REHEARSAL: copies + verifies inside a transaction, then ROLLS BACK
npm run db:import-mysql -- --apply # real run; commits only if every check passes
```
It preserves every id, password hash, token hash, R2 URL/key and timestamp, refuses to run into a non-empty database, advances the id sequences, and
compares per-table row counts, primary-key sums and an MD5 of all password hashes against MySQL before committing. R2 files are not re-uploaded: the same URLs/keys keep working.
Run it from a machine that can reach both databases. If your MySQL is only on your laptop, run it there.

**1.6 Verify.** `npm run db:verify` again (row counts now match the importer's report), then `npm test`.
For a live end-to-end check against the real database, start the API locally with `DATABASE_URL` set and run `npm run smoke` (it creates and cleans up its own `smoke.*` rows — read the header of `scripts/smoke.js` first).

**1.7 Deploy.** Push, let Vercel build, then check `GET /api/health` → `"database":"ok"` and `GET /api/health/ready` (§5).

**1.8 Only after production is verified** (§8 checklist passed, a Neon backup/branch exists, and you have kept a final MySQL dump) may you retire the old MySQL
database — manually, whenever you choose. Nothing in this repository deletes it.

**Notes**
- Neon scales to zero: the first request after idle can take a second or two while the compute wakes (the pool's 10 s connect timeout covers this).
- Keep `(instances × DATABASE_POOL_MAX)` below your Neon connection limit; the pooled host makes this a non-issue for normal traffic.
- TLS is always verified for remote hosts; the app never disables certificate checking. `DATABASE_SSL=false` exists only for a local non-TLS Postgres and is refused in production.
- Case-insensitive behaviour of MySQL (email, license numbers, search) is preserved explicitly: `LOWER()` lookups + unique indexes on `LOWER(email)` / `LOWER(license_number)`, `ILIKE` for searches.

## 2. Cloudflare R2

1. Cloudflare Dashboard → **R2 Object Storage** → *Create bucket*.
   - Create `estatehub-public` (any name) and `estatehub-private`. Location: Automatic.
2. **Public bucket → Settings → Public access** — choose one:
   - **Custom Domain (recommended for production):** *Connect Domain* → e.g. `media.yourdomain.com` (the domain must be on Cloudflare). 
   - **R2.dev subdomain:** *Enable* — fine for testing; rate-limited by Cloudflare and not for production.
   Whatever you use (no trailing slash) is `R2_PUBLIC_BASE_URL`.
3. **Private bucket → Settings → Public access:** leave **disabled**. Do not add a custom domain or r2.dev.
4. **R2 → Manage R2 API Tokens → Create API token**
   - Permissions: **Object Read & Write**
   - Specify bucket(s): select **both** buckets only (not "all buckets")
   - TTL: as you prefer
   - Create → copy the **Access Key ID** and **Secret Access Key** (the secret is shown **once**).
5. **Account ID:** shown on the R2 overview page (right-hand side) and in the dashboard URL. The endpoint
   (`https://<account-id>.r2.cloudflarestorage.com`) is derived from it in code — there is no `R2_ENDPOINT` variable.
6. **CORS** (browsers PUT to R2 and the admin/agent UI fetches private documents). Bucket → Settings → **CORS Policy** → Add → JSON.
   Replace the origins with yours. The site and API share ONE origin on Vercel Services, so the only browser origins that talk to R2 are `http://localhost:5173` (development) and your final production origin(s) — see §6. No `*`.

   *Public bucket* (browser uploads photos here; images themselves load via `<img>` and need no CORS):
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:5173", "https://YOUR-PROJECT.vercel.app", "https://www.yourdomain.com"],
       "AllowedMethods": ["PUT", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   *Private bucket* (browser uploads documents here and reads them back through a presigned link):
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:5173", "https://YOUR-PROJECT.vercel.app", "https://www.yourdomain.com"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Presigned PUTs have the `Content-Type` bound into the signature, so the browser must send exactly the header the API returned (the frontend does).
7. **Lifecycle rule (both buckets).** Uploads that were never "completed" stay under `pending/`. Bucket → Settings →
   **Object lifecycle rules** → Add rule → prefix `pending/` → *Delete uploaded objects after* **1 day**.
8. Values for Vercel (backend project):

| Vercel variable | Value |
|---|---|
| `STORAGE_DRIVER` | `r2` |
| `R2_ACCOUNT_ID` | Account ID (step 5) |
| `R2_ACCESS_KEY_ID` | Access Key ID (step 4) |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key (step 4) |
| `R2_PUBLIC_BUCKET_NAME` | public bucket name |
| `R2_PRIVATE_BUCKET_NAME` | private bucket name |
| `R2_PUBLIC_BASE_URL` | public URL from step 2, `https://…`, no trailing slash |

None of these is ever exposed to the frontend; no `VITE_*` variable holds a credential.

---

## 3. Commit, import and configure the Vercel project

Install the two R2 packages locally once and commit the updated lock file:

```bash
cd estatehub-backend/server
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm pkg set scripts.storage:migrate-r2="node scripts/migrate-local-to-r2.js"
```

Delete the obsolete single-project files if they are still in your working copy (they are replaced by the root `vercel.json`):
`estatehub-react/vercel.json`, `estatehub-backend/server/vercel.json`, `estatehub-backend/server/api/index.js`.

Then:

1. Commit and push (`vercel.json` must be at the **repository root**, next to `estatehub-react/` and `estatehub-backend/`).
2. Vercel → **Add New → Project** → import the repository (or, if you already started the import, close and reopen that screen so Vercel re-reads the pushed `vercel.json`).
3. **Root Directory:** leave as the repository root. **Application/Framework Preset:** **Services** (Build and Deployment settings). A project builds as services only when that preset is selected **and** `vercel.json` has a `services` key.
4. Vercel should list two services — `server` (`estatehub-backend/server`, Express) and `estatehub-react` (`estatehub-react`, Vite). If it offers to generate rewrites or a catch-all to the backend, do **not** accept them: the file in the repo already routes `/api/*` → `server` and everything else → `estatehub-react`.
5. Add the environment variables from §4, then **Deploy**.
6. Do **not** create a second Vercel project for the frontend, and do not set `VITE_API_URL`.

---

## 4. Environment variables

Derived from the variables the code actually reads (`process.env.*` in the backend, `import.meta.env.*` in the frontend). Vercel environment variables are
project-level, so both services' builds can see them; Vite only embeds variables whose names start with `VITE_`, so none of the secrets below can reach the browser bundle.
Add them for **Production**. For **Preview**, either leave them unset or point them at a separate staging database and separate R2 buckets — never reuse production data in previews.

### A. Shared / project (Vercel system variables — nothing to add)
| Name | Notes |
|---|---|
| `VERCEL`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | Provided automatically when "Automatically expose System Environment Variables" is on (default). Used to trust this deployment's own origin. |

### B. Backend (service `server`)
| Variable | Secret? | Value / notes |
|---|---|---|
| `NODE_ENV` | no | `production` |
| `TRUST_PROXY` | no | `1` (so rate limiting sees the real client IP behind Vercel) |
| `DATABASE_URL` | **yes** | Neon connection string (§1.2) — contains the password; the server refuses to start if it is missing, not `postgresql://`, or points at localhost in production |
| `DATABASE_POOL_MAX`, `DATABASE_CONNECT_TIMEOUT_MS` | no | optional; default pool is 2 per instance on Vercel (10 locally), connect timeout 10 s |
| ~~`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `DB_SSL_CA`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_CONNECTION_LIMIT`, `DB_CONNECT_TIMEOUT_MS`~~ | — | **obsolete** (MySQL): delete them from Vercel; nothing reads them any more |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | **yes** | two **different** random strings, 32+ chars each (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | no | optional (defaults `15m` / `30d`) |
| `COOKIE_SECURE` | no | `true` |
| `COOKIE_SAMESITE` | no | `lax` |
| `COOKIE_DOMAIN` | no | **leave unset** (the server refuses to start if it is `localhost`) |
| `FRONTEND_URL` | no | final public URL, `https://…`, no trailing slash (reset-email links + origin allowlist). Falls back to `VERCEL_PROJECT_PRODUCTION_URL` if unset; set it explicitly once you add a custom domain |
| `CORS_ALLOWED_ORIGINS` | no | optional extra origins (e.g. a second custom domain) |
| `CLIENT_ORIGIN` | no | not needed in production (dev default is `http://localhost:5173`) |
| `GMAIL_USER`, `EMAIL_FROM` | no | Gmail address / sender display |
| `GMAIL_PASS` | **yes** | Gmail **App Password** |
| `STORAGE_DRIVER` | no | `r2` |
| `R2_ACCOUNT_ID` | no (treat as private) | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | **yes** | R2 API token |
| `R2_SECRET_ACCESS_KEY` | **yes** | R2 API token (shown once) |
| `R2_PUBLIC_BUCKET_NAME`, `R2_PRIVATE_BUCKET_NAME` | no | the two bucket names (must differ) |
| `R2_PUBLIC_BASE_URL` | no | public bucket URL, `https://…`, no trailing slash |
| `UPSTASH_REDIS_REST_URL` | no | recommended — shared rate-limit counters (see §7) |
| `UPSTASH_REDIS_REST_TOKEN` | **yes** | Upstash REST token |
| `RATE_LIMIT_FAIL_CLOSED` | no | optional, default `false` |
| `HEALTH_CHECK_TOKEN` | **yes** | optional; enables the deep R2 probe on `/api/health/ready` |
| `PORT` | no | not needed (the Express service is entered through `src/app.js`, which never listens) |

> The names are `R2_PUBLIC_BUCKET_NAME` / `R2_PRIVATE_BUCKET_NAME` (not `…_BUCKET`).

### C. Frontend / build-time (service `estatehub-react`)
| Variable | Secret? | Notes |
|---|---|---|
| `VITE_API_URL` | no | **Do not set in production.** Production builds use the same-origin `/api`. It exists only for local development (`http://localhost:5000/api`). |

Scripts only (never set in Vercel): `SMOKE_BASE_URL`, `SMOKE_CONFIRM`, `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD`, `SMOKE_REPORT`.

The server **refuses to start** (clear message in the function logs) on unsafe production config: weak/equal JWT secrets, `COOKIE_SECURE` not true, a `localhost`
cookie domain, no origin information, `SameSite=None` without `Secure`, incomplete R2 settings, or one bucket used for both public and private files.

---

## 5. Verify right after the first deploy

```bash
BASE=https://<your-project>.vercel.app
curl -i $BASE/api/health          # {"success":true,…"database":"ok"}
curl -i $BASE/api/health/ready    # database ok, storage configured (booleans/names only), rateLimitStore
curl -s $BASE/api/uploads/mode    # {"data":{"mode":"direct"}}
curl -i $BASE/sign-in             # 200 + the React index.html (SPA fallback)
curl -i -X POST -H "Origin: https://evil.example" $BASE/api/auth/refresh   # 403
curl -I $BASE/assets/does-not-exist.js                                     # 404 (not index.html)
# optional deep R2 probe: curl -H "x-health-token: $HEALTH_CHECK_TOKEN" "$BASE/api/health/ready?deep=1"
```

## 6. Cloudflare R2 CORS — add the final Vercel origin

After the first deploy you know the production origin (for example `https://estatehub-website.vercel.app`). Cloudflare Dashboard → **R2** → each bucket →
**Settings → CORS Policy** → edit the JSON and put that origin in `AllowedOrigins` of **both** the public and the private bucket policies (JSON in §2 step 6).
List only the origins that really serve the site: `http://localhost:5173`, the Vercel production origin, and your custom domain if you add one. Preview URLs
(`*.vercel.app`) change on every deployment — test uploads on the production origin instead of adding wildcards. Do this before testing uploads; a missing origin shows up as a CORS error on the browser's PUT to R2.

---

## 7. Rate limiting on Vercel

`express-rate-limit` keeps counters in memory per instance. On Vercel many short-lived instances run in parallel, so without a shared store the login/refresh limits are best-effort.
Create a free **Upstash Redis** database, copy its *REST URL* and *REST token* into `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, redeploy; `/api/health/ready` then reports `rateLimitStore: "shared"`.
If Redis is unreachable the limiter fails open (logged); set `RATE_LIMIT_FAIL_CLOSED=true` to reject instead.

## 8. Production verification checklist

**Platform** — `GET /api/health` · `GET /api/health/ready` · homepage + hero image · direct refresh of `/sign-in`, `/browse-properties`, `/property-details/<id>`, `/messages`, `/admin-dashboard`, `/reset-password?token=…` · unknown `/api/xyz` returns the API's JSON 404
**Auth** — sign up · sign in · reload the page (session persists via refresh) · logout (then reload: stays logged out) · forgot password → email link starts with your public URL → reset → old sessions rejected
**Agent** — create listing · upload photos incl. one over 4.5 MB (public R2 bucket; open the URL directly) · edit/delete a photo (object disappears) · verification document upload (private bucket; `https://<public-base>/verification/…` must 404) · renewal document · inquiries · messages · appointments
**Admin** — sign in · approve/reject a listing · open the private verification document (short-lived signed link) · users · renewals · audit log
**Buyer** — browse + filters · property details + map · favorites · inquiry · messages · request appointment · agent confirms · buyer sees the update
**Security** — buyer cannot create listings or call agent APIs · Agent B cannot edit/delete Agent A's listing, photos or amenities · another agent/buyer cannot open a private document · suspended account rejected · admin routes reject buyers/agents · refresh from a foreign `Origin` rejected

---

## 9. Local development

Plain Vite + Express (two terminals; the frontend calls the API directly):
```bash
cd estatehub-backend/server && npm install && npm test && npm run dev        # API on :5000
cd estatehub-react && npm install && npm run build && npm run dev            # site on :5173, calls http://localhost:5000/api
```
Keep `STORAGE_DRIVER=local` in your local backend `.env`, and `VITE_API_URL=http://localhost:5000/api` in the local frontend `.env`.

Through Vercel Services locally (one origin, like production) — from the repository root:
```bash
vercel dev -L        # site and API both on http://localhost:3000 (/api/* -> Express, everything else -> Vite)
```
In this mode the browser must call the **same origin** (`/api`), so set `VITE_API_URL=/api` in `estatehub-react/.env` while testing with `vercel dev`
(or start it with `$env:VITE_API_URL="/api"; vercel dev -L` in PowerShell) and put it back to `http://localhost:5000/api` for plain `npm run dev`.
Otherwise the page loads but its API calls go to `localhost:5000`, which is cross-origin from `localhost:3000` and is not what production does.

---

## 10. Moving existing local uploads to R2 (optional, manual, one time)

Only needed if the database you deploy contains rows pointing at `/uploads/...`.

```bash
# in .env (temporarily): DATABASE_URL of the database to migrate, STORAGE_DRIVER=r2 and the R2_* values
npm run storage:migrate-r2                 # dry run: lists what would happen, changes nothing
npm run storage:migrate-r2 -- --apply      # asks you to type MIGRATE, uploads, then updates each row
```
Rows are updated only after R2 accepted the file; local originals are never deleted; re-running skips finished rows.
Run it from the machine that still has `./uploads`.

---

## 11. Known limits / what is still unverified

- **The PostgreSQL migration was written and unit-tested without access to a live Neon or PostgreSQL server.** The SQL, the schema and the one-time importer have not been executed against a real database by the author; run §1.4–§1.6 and `npm run smoke` and treat any failure as a bug to report.
- **Nothing here has been deployed or tested on Vercel or against live R2 by the author of this change.** The `services` schema, the service-scoped `rewrites`, the Node `entrypoint` and the "Services" project preset were checked against Vercel's current documentation, not by a deployment.
- The Express service is entered through `src/app.js` (`"entrypoint"` in `vercel.json`), which exports the app and never calls `listen`. If Vercel rejects that path, remove the `entrypoint` line; Vercel then auto-detects the root `server.js` (the supported "port listener" pattern), which also works but runs its start-up database check.
- Vercel environment variables are shared by both services' builds (only `VITE_*` values are embedded in the browser bundle).
- Without Upstash, rate limiting is per instance (best-effort).
- Presigned PUTs cannot enforce a maximum size; an oversized pending object is rejected and deleted at "complete" or by the 1-day `pending/` lifecycle rule.
- Vercel Hobby is for non-commercial use; check plan limits (function duration, bandwidth, request size) before a real launch.
- Rotate any credential that has ever been in a shared zip or chat.
