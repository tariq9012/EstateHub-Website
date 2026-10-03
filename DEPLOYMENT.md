# EstateHub — deployment guide (Vercel + Cloudflare R2 + MySQL)

Two Vercel projects from this one repository, one hosted MySQL database, two Cloudflare R2 buckets.

| Part | Where | Root directory |
|---|---|---|
| Frontend (React/Vite) | Vercel project A | `estatehub-react` |
| Backend (Express API) | Vercel project B | `estatehub-backend/server` |
| Database | hosted MySQL 8 (any provider) | — |
| Files | Cloudflare R2: one **public** bucket, one **private** bucket | — |
| Email | Gmail SMTP (unchanged) | — |

> **Never paste secrets into chat or commit them.** Type R2, database, JWT and Gmail values directly into
> Vercel → Project → Settings → Environment Variables.

---

## 0. Decisions you should know about

**Direct browser → R2 uploads.** Vercel Functions reject any request body over **4.5 MB**
(`FUNCTION_PAYLOAD_TOO_LARGE`). EstateHub accepts 5 MB photos (up to 20 per request) and 10 MB documents, so
sending files *through* the API would fail in production. In R2 mode the flow is:

1. `…/direct/presign` — the API authenticates you, applies the same role/ownership/status/cap rules as before, checks
   the declared type and size, and returns a **5-minute presigned PUT URL** for a *pending* key.
2. The browser PUTs the file straight to R2.
3. `…/direct/complete` — the API re-authorizes, reads the real object from R2 (size, **magic-byte content check**, declared
   type must match), copies it from `pending/…` to its final key, deletes the pending object, and only then runs the
   *existing* controller (photo caps, review-status rules, database insert). Anything invalid is deleted and refused.

Local development is unchanged (`STORAGE_DRIVER=local`: multer + `./uploads`). In R2 mode the old multipart routes answer
`409 DIRECT_UPLOAD_REQUIRED`, so nothing is ever written to Vercel's read-only disk.

**Two buckets, not one.** Cloudflare can only make a *whole bucket* public. Listing photos must be public; verification
and licence documents must not. So photos/avatars live in a public bucket and documents in a private bucket that has
**no** public access and no custom domain. (`R2_PUBLIC_BUCKET_NAME` and `R2_PRIVATE_BUCKET_NAME` must differ — the server
refuses to start otherwise.)

**What MySQL stores** (existing `VARCHAR(500)` columns — **no migration needed**):

| Column | Value |
|---|---|
| `property_images.image_url`, `users.avatar_url` | public URL, e.g. `https://media.example.com/properties/12/<uuid>.jpg` |
| `verification_documents.file_url` (initial + renewal) | bare private key, e.g. `verification/7/<uuid>.pdf` — never a URL |

Private documents are read through `GET /api/verification/documents/:id/file`: the API checks owner-or-admin, then returns
a **120-second presigned URL** (JSON). It is never stored. Old `/uploads/...` rows keep working until you migrate them (§9).

**Cookies.** The refresh token is an `HttpOnly` cookie. Two different `*.vercel.app` hosts are *cross-site*
(`vercel.app` is on the Public Suffix List), which forces `SameSite=None; Secure`, and Safari/other browsers that block
third-party cookies can then break login persistence. **Strongly recommended:** put both apps under one domain you own,
e.g. `estatehub.com` (frontend) and `api.estatehub.com` (backend). Then use `COOKIE_SAMESITE=lax` and it behaves like local dev.
A cross-site `SameSite=None` setup also gets an `Origin` allow-list check on `/auth/refresh` and `/auth/logout` (CSRF guard).

---

## 1. Hosted MySQL

1. Create a MySQL 8 database at a provider of your choice (Aiven, TiDB Cloud, AWS RDS, DigitalOcean, Railway, …).
2. Note host, port, database, user, password, and whether TLS is required (usually yes) and whether a CA certificate is provided.
3. Apply the **existing** schema once to this **new, empty** database: run `estatehub-backend/database/schema.sql`
   (plus any additive migration files you have applied locally) with the provider's console or `mysql` client.
   Do **not** run it against a database that already holds data you care about.
4. No schema change is required for R2.
5. The app pins every connection to UTC (`SET time_zone = '+00:00'`); nothing to configure.

---

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
   Replace the origins with yours (add every origin that serves the site; no `*`).

   *Public bucket* (browser uploads photos here; images themselves load via `<img>` and need no CORS):
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:5173", "https://YOUR-FRONTEND.vercel.app", "https://www.yourdomain.com"],
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
       "AllowedOrigins": ["http://localhost:5173", "https://YOUR-FRONTEND.vercel.app", "https://www.yourdomain.com"],
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

## 3. Backend → Vercel (Project B)

Install the two new packages locally first and commit the updated `package.json`/`package-lock.json`:

```bash
cd estatehub-backend/server
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm pkg set scripts.storage:migrate-r2="node scripts/migrate-local-to-r2.js"
```

Vercel → *Add New → Project* → import the repository, then:

| Setting | Value |
|---|---|
| Root Directory | `estatehub-backend/server` |
| Framework Preset | **Other** |
| Build Command | leave empty |
| Output Directory | leave empty |
| Install Command | default (`npm install`) |
| Node.js Version | 20.x or 22.x |

`vercel.json` and `api/index.js` (already in the repo) send every request to the Express app; nothing calls `app.listen()` on Vercel.

### Backend environment variables (Production)

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | from your MySQL provider |
| `DB_SSL` | `true` (and `DB_SSL_CA` = CA PEM with `\n` for newlines, if your provider gives one) |
| `DB_CONNECTION_LIMIT` | optional; default is 2 per instance on Vercel — keep *instances × limit* below your DB's max connections |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | two **different** random strings, 32+ chars (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `FRONTEND_URL` | final frontend URL, `https://…`, no trailing slash (CORS **and** password-reset links) |
| `CORS_ALLOWED_ORIGINS` | optional extra origins, comma-separated (e.g. a custom domain next to the vercel.app one) |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `lax` if frontend and API share a parent domain (recommended); `none` for two `*.vercel.app` hosts |
| `COOKIE_DOMAIN` | leave **unset** (host-only cookie), or `.yourdomain.com` to share between `app.` and `api.` |
| `GMAIL_USER`, `GMAIL_PASS`, `EMAIL_FROM` | unchanged Gmail SMTP values (App Password) |
| `STORAGE_DRIVER` + `R2_*` | §2 step 8 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | strongly recommended — see "Rate limiting" below |
| `HEALTH_CHECK_TOKEN` | optional; enables the deep R2 probe on `/api/health/ready` |

The server **refuses to start** (clear message in the Vercel function logs) if production config is unsafe: weak/equal JWT
secrets, `COOKIE_SECURE` not true, missing `FRONTEND_URL`, `SameSite=None` without `Secure`, incomplete R2 settings, or
the same bucket used for public and private files.

### Verify the backend

```bash
curl https://YOUR-BACKEND.vercel.app/api/health          # api + database
curl https://YOUR-BACKEND.vercel.app/api/health/ready     # + storage configured, rate-limit store (booleans/names only)
curl -H "x-health-token: $HEALTH_CHECK_TOKEN" "https://YOUR-BACKEND.vercel.app/api/health/ready?deep=1"   # also probes both buckets
curl https://YOUR-BACKEND.vercel.app/api/uploads/mode     # {"data":{"mode":"direct"}}
```

---

## 4. Frontend → Vercel (Project A)

| Setting | Value |
|---|---|
| Root Directory | `estatehub-react` |
| Framework Preset | **Vite** |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment variable | `VITE_API_URL` = `https://YOUR-BACKEND.vercel.app/api` (include `/api`, no trailing slash) |

`vercel.json` rewrites every non-asset path to `index.html`, so deep links such as `/messages`, `/admin-dashboard`,
`/property/…` and `/reset-password?token=…` work on refresh. `VITE_API_URL` is baked in at **build** time — redeploy after changing it.
The Home hero is the local file `/assets/images/estatehub-hero.jpg` (served from `dist`).

### Wire the two together

1. Deploy the backend (§3) → note its URL.
2. Deploy the frontend with `VITE_API_URL` set → note its URL.
3. Back in the backend project set `FRONTEND_URL` (and `CORS_ALLOWED_ORIGINS` for extra origins) → **Redeploy** the backend.
4. Add the final frontend origin(s) to both R2 CORS policies (§2 step 6).
5. If you add a custom domain later, update `FRONTEND_URL`/`CORS_ALLOWED_ORIGINS`, `VITE_API_URL`, the R2 CORS origins and (if you
   change the public media domain) `R2_PUBLIC_BASE_URL` — rows store the full public URL, so after changing it run
   `UPDATE property_images SET image_url = REPLACE(image_url, 'https://old-host', 'https://new-host');` (same for `users.avatar_url`).

---

## 5. Rate limiting on Vercel

`express-rate-limit` keeps counters in memory. On Vercel many short-lived instances run in parallel, so without a shared
store the login/refresh limits are **best-effort only** (each instance counts separately). The code supports a shared
store with no extra npm package: create a free **Upstash Redis** database, copy its *REST URL* and *REST token* into
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, redeploy. `/api/health/ready` then reports `rateLimitStore: "shared"`.
If Redis is unreachable the limiter fails **open** (logged); set `RATE_LIMIT_FAIL_CLOSED=true` to reject instead.

---

## 6. Test authentication, email and storage

1. Register/login on the deployed frontend; reload the page (session refresh); log out; log in again.
2. Forgot Password → the email arrives from Gmail and the link starts with your **deployed** frontend URL → reset → old sessions are gone.
3. Agent → create a listing → upload photos (including one over 4.5 MB). Open the photo URL directly: it loads from `R2_PUBLIC_BASE_URL`.
4. Agent → Verification → upload a PDF. Confirm in the R2 dashboard it is in the **private** bucket under `verification/<agentId>/`, and that
   `https://<public-base>/verification/<agentId>/<file>` returns 404/403.
5. Admin → open that document: it renders (a short-lived signed link is fetched). Another agent/buyer cannot open it.
6. Delete a photo: the object disappears from the public bucket.

**Production smoke script:** `npm run smoke` creates real users/listings. Only point it at a *staging* database
(`SMOKE_BASE_URL=https://staging…/api SMOKE_CONFIRM=yes`, plus `SMOKE_ADMIN_EMAIL`/`SMOKE_ADMIN_PASSWORD` for the admin checks). Do not run it against a database with real customers.

---

## 7. Post-deployment checklist

**Public** — Home (hero image loads) · Browse + filters · Property Details + map · Find an Agent · Agent Profile · deep links reload correctly
**Auth** — register · login · refresh (reload) · logout · forgot password (email, deployed link) · reset password
**Agent** — create property · R2 photo upload (>4.5 MB too) · edit/delete photo · listing management · inquiries · messages · appointments · verification document upload · renewal document upload
**Admin** — login · approve/reject listing · users (suspend/reactivate) · agent verification · private document view · renewals · audit log · notification settings
**Buyer** — browse · save · inquiry · messages · appointment
**Security** — buyer blocked from agent/listing operations · Agent B cannot edit/delete Agent A's listing, photos or amenities · private document URL/key not publicly reachable · a suspended account is rejected · admin routes reject buyers/agents · `curl -H "Origin: https://evil.example" -X POST …/api/auth/refresh` is refused (403) · browser requests from an unlisted origin get no CORS headers

---

## 8. Local development (unchanged)

```bash
cd estatehub-backend/server && npm install && npm test && npm run dev
cd estatehub-react && npm install && npm run build && npm run dev
```
`.env` keeps `STORAGE_DRIVER=local` (or unset). Add the new optional variables from `.env.example` only when you need them.

---

## 9. Moving existing local uploads to R2 (optional, manual, one time)

Only needed if the database you deploy contains rows pointing at `/uploads/...`.

```bash
# in .env (temporarily): DB_* of the database to migrate, STORAGE_DRIVER=r2 and the R2_* values
npm run storage:migrate-r2                 # dry run: lists what would happen, changes nothing
npm run storage:migrate-r2 -- --apply      # asks you to type MIGRATE, uploads, then updates each row
```
Rows are updated only after R2 accepted the file; local originals are never deleted; re-running skips finished rows.
Run it from the machine that still has `./uploads`.

---

## 10. Known limits / what is still your responsibility

- **Not deployed or tested on Vercel/R2 by the author of this change** — everything above is prepared, not verified live.
- Cross-site cookies on two `vercel.app` hosts may fail in Safari and other browsers that block third-party cookies → use a shared parent domain.
- Without Upstash, rate limiting is per instance (best-effort).
- The lifecycle rule (§2 step 7) is what cleans abandoned `pending/` uploads; a presigned PUT cannot enforce a maximum size, so an oversized pending object is rejected (and deleted) at "complete" or by the lifecycle rule.
- Vercel Hobby is for non-commercial use; check plan limits (function duration, bandwidth) for a real launch.
- Rotate any credential that has ever been in a shared zip/chat (see the secret-scan note in the change report).
