# Interscale Travel CRM

A multi-tenant SaaS CRM for travel agencies.

> **Status: Phase 8 (Quotation Templates and Customer Quotations) complete.**
> The CRM includes multi-tenancy, authentication, administration, leads,
> follow-ups, reusable quotation templates, immutable customer quotation
> versions, private document storage, PDF generation, email delivery and
> secure public accept/reject links. Bookings and payments are intentionally
> deferred to Phase 9.

---

## Table of contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Folder structure](#folder-structure)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Development commands](#development-commands)
- [Testing](#testing)
- [Building](#building)
- [API overview](#api-overview)
- [Quotation documents and AWS S3](#quotation-documents-and-aws-s3)
- [Security controls](#security-controls)
- [Multi-tenancy design](#multi-tenancy-design)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## Architecture

Two independently deployable applications plus a shared contract package, in an
npm-workspaces monorepo.

```
Browser
  │
  ▼
apps/web  — React 18 + Vite 7 + TypeScript + Tailwind + TanStack Query
  │  (dev: Vite proxies /api → :4000, keeping the session cookie first-party)
  ▼
apps/api  — Express 4 + TypeScript, layered per module:
  │           routes → controller → service → repository
  ▼
PostgreSQL 16 via Prisma ORM (Docker Compose)

packages/shared — response envelope, error codes, constants, health contracts.
                  Imported by BOTH sides, so the wire format cannot drift.
```

**Backend layering.** No business logic lives in route files. Each module is
`*.routes.ts` → `*.controller.ts` → `*.service.ts` → `*.repository.ts`, with
`*.schemas.ts` for Zod validation. The `health` module implements this shape in
full and is the template for every module that follows.

**Ports:** web `5173`, api `4000`, PostgreSQL `5432`.

---

## Prerequisites

| Tool           | Version                       | Notes                                       |
| -------------- | ----------------------------- | ------------------------------------------- |
| Node.js        | **>= 20.19** (`.nvmrc` → 20)  | Vite 7 requires it; Node 18 is EOL.         |
| npm            | >= 10                         | Workspaces are used throughout.             |
| Docker Desktop | any recent                    | Runs PostgreSQL. Must be running.           |

```bash
nvm use          # picks up .nvmrc
node -v          # expect v20.x
```

---

## Folder structure

```
travel-crm/
├── apps/
│   ├── api/                        # Express + TypeScript backend
│   │   ├── prisma/
│   │   │   ├── migrations/         # SQL migration history (committed)
│   │   │   ├── schema.prisma       # Phase 1: infrastructure model only
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── config/             # env (Zod-validated), logger, prisma
│   │   │   ├── middleware/         # request-id, error-handler,
│   │   │   │                       #   validate-request, rate-limiters
│   │   │   ├── modules/
│   │   │   │   └── health/         # routes/controller/service/repository
│   │   │   ├── utils/              # errors, api-response, async-handler
│   │   │   ├── app.ts              # Express assembly (helmet, cors, cookies)
│   │   │   ├── routes.ts           # single module mount point
│   │   │   └── server.ts           # listen + graceful shutdown
│   │   ├── tests/                  # Supertest integration tests
│   │   ├── tsup.config.ts
│   │   └── vitest.config.ts
│   └── web/                        # React + Vite frontend
│       ├── src/
│       │   ├── api/                # typed fetch client + query hooks
│       │   ├── components/         # ui/, feedback/
│       │   ├── pages/
│       │   ├── providers/          # QueryProvider
│       │   ├── routes/             # AppRoutes
│       │   ├── test/setup.ts
│       │   ├── utils/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   └── index.css
│       ├── tailwind.config.js
│       └── vite.config.ts
├── packages/
│   └── shared/                     # cross-cutting contracts
│       └── src/{index,constants,api-response,health}.ts
├── docker-compose.yml              # PostgreSQL 16
├── eslint.config.js                # flat config, TS + React hooks
├── prettier.config.js
├── tsconfig.base.json              # strict mode for every workspace
├── .env.example
└── package.json                    # workspaces + all root scripts
```

---

## Quick start

From the repository root:

```bash
nvm use                     # Node 20
npm install                 # install all workspaces

cp .env.example .env        # create local env (see below)

npm run db:up               # start PostgreSQL in Docker
npm run db:generate         # generate the Prisma client
npm run db:migrate          # apply migrations
npm run db:seed             # optional: seed data

npm run dev                 # start API (:4000) and web (:5173) together
```

Then open **http://localhost:5173** — the status page should show both
"API service" and "PostgreSQL database" as **Healthy**.

---

## Environment variables

A single `.env` at the **repository root** is shared by the API, the web app
and Docker Compose. Copy it from the template:

```bash
cp .env.example .env
```

The API validates every variable with Zod at boot and **refuses to start** if
anything is missing or malformed, printing all problems at once.

| Variable                        | Purpose                                        |
| ------------------------------- | ---------------------------------------------- |
| `NODE_ENV`                      | `development` \| `test` \| `production`        |
| `LOG_LEVEL`                     | pino level                                     |
| `API_PORT`, `API_URL`           | Backend bind port and public URL               |
| `WEB_URL`                       | Frontend origin — the **only** CORS allow-list entry |
| `DATABASE_URL`                  | PostgreSQL connection string                   |
| `POSTGRES_*`                    | Credentials consumed by `docker-compose.yml`   |
| `SESSION_COOKIE_NAME`           | Name of the httpOnly session cookie            |
| `SESSION_SECRET`                | Cookie signing secret (min 32 chars)           |
| `TOKEN_PEPPER`                  | Pepper for session/OTP/reset-token hashing     |
| `SESSION_EXPIRY_HOURS`          | Standard session lifetime                      |
| `REMEMBER_ME_EXPIRY_DAYS`       | Extended lifetime for "remember me"            |
| `OTP_EXPIRY_MINUTES`            | Email OTP validity (default 10)                |
| `OTP_RESEND_COOLDOWN_SECONDS`   | Minimum gap between OTP sends (default 60)     |
| `OTP_MAX_ATTEMPTS`              | Failed verifications before invalidation       |
| `PASSWORD_RESET_EXPIRY_MINUTES` | Reset-token validity (default 30)              |
| `LOGIN_MAX_FAILED_ATTEMPTS`     | Failed sign-ins before lockout (default 5)     |
| `LOGIN_LOCKOUT_MINUTES`         | Lockout duration (default 15)                  |
| `CSRF_COOKIE_NAME`              | JS-readable double-submit CSRF cookie          |
| `CSRF_HEADER_NAME`              | Header the CSRF token is echoed in             |
| `EMAIL_PROVIDER`                | `console` (dev) \| `smtp` (prod) \| `memory` (test) |
| `EMAIL_FROM`, `SMTP_*`          | Outbound email settings                        |
| `STORAGE_PROVIDER`              | `memory` (dev/test) or `s3` (production)       |
| `AWS_REGION`, `AWS_S3_BUCKET`   | Private quotation-document bucket              |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Optional static credentials; prefer an IAM role |
| `AWS_S3_ENDPOINT`, `AWS_S3_FORCE_PATH_STYLE` | Optional S3-compatible development endpoint |
| `AWS_S3_SERVER_SIDE_ENCRYPTION` | `AES256` or `aws:kms`                           |
| `AWS_S3_PRESIGNED_URL_EXPIRY_SECONDS` | Upload/download URL lifetime (default 300) |
| `MAX_UPLOAD_SIZE_MB`            | Per-attachment limit (default 10)              |
| `RATE_LIMIT_*`                  | Global rate-limit window and ceiling           |
| `VITE_API_URL`                  | Proxy target for the Vite dev server           |

Generate real secrets with:

```bash
openssl rand -base64 48
```

**Production guards.** With `NODE_ENV=production` the API additionally refuses
to boot if `SESSION_SECRET`/`TOKEN_PEPPER` still contain the example
placeholder, or if `EMAIL_PROVIDER` is still `console`.

`.env` is gitignored. Never commit real secrets.

---

## Database

PostgreSQL runs in Docker under the Compose project name
**`interscale-crm-monorepo`** (set explicitly in `docker-compose.yml` so it
cannot collide with other stacks on the same machine).

```bash
npm run db:up          # docker compose up -d
npm run db:down        # docker compose down
npm run db:generate    # prisma generate
npm run db:migrate     # prisma migrate dev  (creates + applies)
npm run db:deploy      # prisma migrate deploy  (production/CI)
npm run db:seed        # run prisma/seed.ts
npm run db:studio      # open Prisma Studio
npm run db:reset       # drop, re-migrate and re-seed
```

Prisma CLI commands are wrapped in `dotenv -e ../../.env --` so they read the
root `.env` rather than looking for one inside `apps/api`.

### Schema

`apps/api/prisma/schema.prisma` holds 11 models and 4 enums. UUID primary keys,
snake_case table names.

| Model | Tenancy | Notes |
| --- | --- | --- |
| `Company` | tenant root | unique `slug` |
| `User` | `companyId` | soft delete, globally unique `normalizedEmail` |
| `Role` | `companyId` | unique per company, `hierarchyLevel` |
| `Permission` | **global** | unique `key`, `isAvailable` flag |
| `RolePermission` | via role | composite PK |
| `PermissionTemplate` | `companyId` | soft delete, unique name per company |
| `PermissionTemplatePermission` | via template | composite PK |
| `Session` | via user | unique `tokenHash` (SHA-256) |
| `EmailVerificationOtp` | via user | `otpHash`, attempt limits |
| `PasswordResetToken` | via user | unique `tokenHash`, single use |
| `ActivityLog` | `companyId` | append-only, actor/target `SetNull` |

Enums: `CompanyStatus`, `UserStatus`, `TemplateStatus`, `ActivityAction`.

**Why email is globally unique.** Login accepts email + password with no tenant
selector, so an address must resolve to exactly one account. The trade-off is
that one person cannot hold accounts at two agencies under the same address;
changing that would require a company selector at sign-in.

**Soft deletion.** `User` and `PermissionTemplate` use `deletedAt`. Unique
constraints deliberately still count soft-deleted rows — releasing an archived
user's email would let a new account claim it and make restoring the original
impossible.

**Enum parity.** `@interscale/shared` re-declares the enums so the frontend
never imports Prisma. `apps/api/src/db/enum-parity.ts` asserts at compile time
that both definitions match, so drift fails `npm run typecheck`.

---

## Development commands

| Command               | Effect                                          |
| --------------------- | ----------------------------------------------- |
| `npm run dev`         | API + web concurrently, colour-tagged           |
| `npm run dev:api`     | API only, `tsx watch` hot reload (`:4000`)      |
| `npm run dev:web`     | Web only, Vite HMR (`:5173`)                    |
| `npm run lint`        | ESLint across the monorepo                      |
| `npm run lint:fix`    | ESLint with `--fix`                             |
| `npm run typecheck`   | `tsc --noEmit` in every workspace               |
| `npm run format`      | Prettier write                                  |
| `npm run format:check`| Prettier check (CI-friendly)                    |
| `npm run clean`       | Remove all `node_modules` and `dist`            |

---

## Authentication

Opaque, server-backed sessions — **not** JWT. Logout and "revoke every session
after a password reset" are hard requirements, and a JWT cannot be revoked
before expiry without a server-side blocklist (which is just this session table
with worse ergonomics). A random token, looked up by hash, gives instant
revocation.

**Session flow.** A cryptographically random token is generated; only its
SHA-256 hash is stored in `sessions`. The raw token is sent in an httpOnly,
SameSite=Lax cookie (Secure in production) — never in a response body and never
in JS-readable storage. Each request hashes the incoming cookie and looks up a
non-revoked, non-expired session. `lastUsedAt` is refreshed at most once every
5 minutes to avoid a write per request. Sessions are revoked on logout, rotated
on email verification (session-fixation defence), and all revoked after a
password reset.

**Endpoints** (all under `/api/auth`):

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/register` | public | Create a company + Owner, send OTP |
| POST | `/verify-email` | session | Verify the OTP (user from session) |
| POST | `/resend-verification-otp` | session | Re-send OTP (60s cooldown) |
| POST | `/login` | public | Sign in |
| POST | `/logout` | optional | Revoke session, clear cookies |
| GET | `/me` | session | Current user + effective permissions |
| POST | `/forgot-password` | public | Send reset link (generic response) |
| GET | `/reset-password/:token/validate` | public | Check a reset link |
| POST | `/reset-password` | public | Set a new password |
| GET | `/protected-ping` | session + verified | Middleware proof (not a feature) |

**Middleware.** `requireAuth` resolves the session and attaches an `AuthContext`
whose `companyId` is read from the user row — never from request input.
`requireVerifiedEmail` gates everything except the four endpoints a
pending-verification user may reach (`/me`, `/verify-email`,
`/resend-verification-otp`, `/logout`). `optionalAuth` backs logout.

**Permissions.** One rule, no deny/override semantics:
`effective = (role ∪ active-template) ∩ available`. A template can only add,
never remove, and a permission for an unbuilt module (`isAvailable = false`)
can never become effective.

### CSRF protection

Two layers, because the flows differ:

1. **Origin/Referer allow-list** on every state-changing request. Works before
   any session exists (register, login, forgot-password), which a session-bound
   token cannot.
2. **Signed double-submit token** whenever a session exists:
   `HMAC-SHA256(SESSION_SECRET, sessionTokenHash)`, delivered in a JS-readable
   cookie and echoed in `X-CSRF-Token`. Nothing extra is stored, and a token
   from another session is useless.

Backed by `SameSite=Lax`. **Known trade-off:** requiring `Origin` rejects
non-browser clients that omit it (a future native app would need a token path).

### Email service

Provider abstraction in `apps/api/src/services/email/`:

- `console` (dev) — prints the message, including the OTP and reset link, to the
  API log. **Development only.**
- `smtp` (production) — nodemailer; required when `NODE_ENV=production`.
- `memory` (tests) — collects mail in-process so tests read the OTP/reset link
  without the API ever exposing one. Rejected unless `NODE_ENV=test`.

Delivery happens *after* the registration transaction commits, so an
unreachable mail host never orphans a half-created company — the user resends.

### Retrieving the dev OTP and reset link

With `EMAIL_PROVIDER=console`, both are printed to the API log, clearly bannered
as `[DEV EMAIL]`:

```
────────────────────────────────────────────────────────────────
[DEV EMAIL] to: you@agency.com
[DEV EMAIL] subject: Your Interscale Travel CRM verification code
────────────────────────────────────────────────────────────────
Your Interscale Travel CRM verification code for … is:

123456
```

The password-reset email contains the full `http://localhost:5173/reset-password/<token>`
link. Neither the OTP nor the token ever appears in an API response.

---

## Demo data

`npm run db:seed` creates the demo tenant. It is **idempotent** — every write is
an `upsert`, so running it repeatedly converges rather than duplicating.

**Company:** Interscale Demo Travels (`interscale-demo-travels`)

| Email | Role | Status |
| --- | --- | --- |
| `owner@interscale.local` | Owner | ACTIVE |
| `manager@interscale.local` | Manager | ACTIVE |
| `sales@interscale.local` | Sales Executive | ACTIVE |
| `dataentry@interscale.local` | Data Entry | INACTIVE |
| `viewer@interscale.local` | View Only | SUSPENDED |

**Development password (all accounts):** `Interscale@2026`

> ⚠️ Development only. It is committed on purpose so the demo tenant works out
> of the box, which is exactly why it must never exist in a deployed
> environment. `seed.ts` throws if `NODE_ENV=production`.

The inactive and suspended accounts are intentional: they exercise the
"cannot sign in" paths in later phases. Sessions, OTPs and reset tokens are
**not** seeded — credentials are minted by the auth flow, never pre-created.

Also seeded: the 47-key permission catalogue (21 available, 26 reserved for
future modules), 5 default roles with grants, 4 quick-setup templates, and 7
sample activity-log entries.

---

## Testing

```bash
npm test           # api + web
npm run test:api   # Vitest + Supertest + database integration
npm run test:web   # Vitest + React Testing Library (jsdom)
```

### Test database

Integration tests run against a **separate** database (`interscale_crm_test`),
created and migrated automatically on first run. Development data is never
touched.

Two guards make that structural rather than a convention: the suite refuses to
start unless the database name ends with `_test`, and `tests/setup.ts`
redirects `DATABASE_URL` *before* the Prisma singleton is constructed, so the
repositories under test cannot reach the dev database.

Override with `TEST_DATABASE_URL` in `.env` if you want a different target.

Coverage: schema constraints (uniqueness, cascade, restrict, set-null), soft
deletion, cross-tenant isolation, seed idempotency, permission availability
rules, crypto and normalisation utilities, and the health endpoints.

Rate limiting is skipped when `NODE_ENV=test` so suites are not order-dependent.

---

## Building

```bash
npm run build          # shared → api → web
npm run build:shared   # tsc
npm run build:api      # tsup → apps/api/dist/server.js (ESM, node20)
npm run build:web      # tsc -b && vite build → apps/web/dist

node apps/api/dist/server.js   # run the built API
```

The API bundle inlines `@interscale/shared`, so the built server runs without
workspace symlink resolution.

---

## API overview

All routes are mounted under `/api`. Every response uses one envelope.

**Success**

```json
{ "success": true, "data": {}, "message": "..." }
```

**Error**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "fields": { "email": ["Invalid email"] },
    "requestId": "…"
  }
}
```

Error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `RATE_LIMITED`, `EMAIL_NOT_VERIFIED`, `INTERNAL_ERROR`,
`SERVICE_UNAVAILABLE`.

### Endpoints (Phase 1)

| Method | Path              | Description                                      |
| ------ | ----------------- | ------------------------------------------------ |
| `GET`  | `/api/health`     | Liveness. No I/O. Always 200 when the process is up. |
| `GET`  | `/api/health/db`  | Readiness. Real `SELECT 1` via Prisma. 200 up / 503 down. |

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/health/db
```

---

## Quotation documents and AWS S3

Phase 8 stores generated quotation PDFs and supporting attachments outside
PostgreSQL. The database contains metadata only; object bodies live behind the
`StorageService` abstraction in `apps/api/src/services/storage/`.

### Provider behavior

- `STORAGE_PROVIDER=s3` uses AWS SDK for JavaScript v3 and is required in
  production. No public ACL is set. Uploads and downloads use short-lived
  presigned URLs.
- `STORAGE_PROVIDER=memory` is the development/test fake. Generated PDFs are
  retained in-process and no AWS call occurs. Direct browser attachment upload
  is intended for S3-configured development; automated tests mock the PUT.
- PDFKit generates deterministic A4 PDFs without a Chromium runtime. PDFs
  contain customer-safe itinerary, hotels, services, inclusions, exclusions,
  terms and totals; they never contain internal costs, margin or internal
  notes. Existing PDFs for an unchanged immutable version are reused.

Every object key is generated by the backend and includes the tenant id:

```text
companies/{companyId}/quotations/{quotationId}/versions/{versionId}/documents/{documentId}/{sanitizedFileName}
companies/{companyId}/quotations/{quotationId}/attachments/{documentId}/{sanitizedFileName}
companies/{companyId}/branding/logo/{sanitizedFileName}
```

The API never accepts an object key as authority and never returns a raw key or
permanent S3 URL to the browser. It validates quotation ownership before every
presign, confirmation and deletion. Attachments are limited to 20 per
quotation, `MAX_UPLOAD_SIZE_MB` each, and these initial type/extension pairs:
PDF, JPEG, PNG and WebP. The confirmation step checks the stored size and
content type. Executables are rejected. Magic-byte inspection is not performed
for direct S3 uploads; add an antivirus/content-scanning event pipeline before
accepting untrusted documents in a high-risk deployment.

### Bucket setup

1. Create a dedicated bucket in `AWS_REGION`.
2. Enable all four **S3 Block Public Access** settings at the account and
   bucket level. Keep Object Ownership set to bucket-owner-enforced.
3. Enable default encryption (SSE-S3/AES256, or SSE-KMS with a dedicated key)
   and versioning. The application also requests server-side encryption on
   every PUT.
4. Set `STORAGE_PROVIDER=s3`, `AWS_REGION` and `AWS_S3_BUCKET`. On ECS, EKS,
   EC2 or Lambda, attach an IAM role and leave both static credential variables
   blank. Local S3-compatible services can use `AWS_S3_ENDPOINT` and
   `AWS_S3_FORCE_PATH_STYLE=true`.
5. For direct browser PUTs, allow only the CRM web origin. A minimal CORS rule:

```json
[
  {
    "AllowedOrigins": ["https://crm.example.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "content-length", "x-amz-server-side-encryption"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

The application role needs only this bucket/prefix. Add KMS permissions when
using SSE-KMS:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/companies/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET",
      "Condition": { "StringLike": { "s3:prefix": ["companies/*"] } }
    }
  ]
}
```

Use bucket lifecycle rules to abort incomplete multipart uploads after one day,
transition noncurrent versions to cheaper storage, and expire soft-deleted
documents according to the agency's legal retention policy. Do not delete an
accepted quotation's commercial snapshot while it is required for audit or
consumer-protection obligations.

### Quotation email and public links

Quotation delivery reuses the existing console/SMTP/memory email abstraction.
Only finalized versions can be sent. A send records a delivery attempt, creates
or reuses the exact-version PDF, optionally creates a public link, updates sent
timestamps and records an activity. Customer emails contain secure links, not
object keys.

Public tokens are 256-bit random values; only SHA-256 hashes are stored. Public
routes live at `/public/quotations/:token`, are rate limited, can expire or be
revoked, project customer-safe fields only, and record first/last view while
ignoring common bot/crawler user agents. Accept/reject is terminal and never
creates a booking or payment.

---

## Security controls

Implemented in Phase 1:

- **Helmet** security headers; `x-powered-by` disabled.
- **CORS** restricted to a single origin (`WEB_URL`) with credentials enabled.
- **Body-size limits** of 100 kb on JSON and urlencoded bodies.
- **Rate limiting** globally, plus a stricter `authLimiter` pre-built for the
  Phase 3 credential and OTP endpoints.
- **Environment validation** at boot, with production placeholder guards.
- **Structured logging** (pino) with redaction of `authorization`, `cookie`,
  `set-cookie`, and any `password`, `otp` or `token` field.
- **Request correlation ids** on every request and error response.
- **Centralised error handling** — unexpected errors are logged in full and
  masked in production; internals never reach the client.
- **Mass-assignment protection** — `validateRequest` *replaces* `req.body`,
  `req.query` and `req.params` with the parsed result, so undeclared fields are
  discarded before reaching a controller.
- **Cookie parser** wired with `SESSION_SECRET`, ready for httpOnly sessions.
- **Frontend** uses `credentials: 'include'` with relative `/api` paths. No
  token is read from or written to `localStorage` or `sessionStorage`.

Planned in Phase 3: Argon2 hashing, opaque server-backed sessions (only the
token *hash* stored), CSRF protection for state-changing requests, account
lockout, and hashed single-use OTP / reset tokens.

---

## Multi-tenancy design

Every travel agency is a separate **company tenant**.

1. `companyId` is **always** derived from the authenticated session — never
   read from the request body, query string or URL.
2. Every company-owned query is scoped by `companyId`.
3. Reads and writes match on **both** the record id and `companyId`, so a
   modified URL cannot reach another tenant's row.
4. Multi-step critical actions run inside a database transaction.
5. Cross-tenant isolation tests gate the work.

The first person to register a company becomes its **Owner**.

### How it is enforced

`src/db/tenant.ts` defines a branded `TenantContext`. The brand matters: a bare
`{ companyId: req.body.companyId }` will not type-check as a `TenantContext`,
so client-supplied values cannot reach a repository by accident. It is built
only by `createTenantContext(companyId)`, called with a value read from a
verified session.

Every tenant-scoped repository takes that context as its **first parameter**:

```ts
usersRepository.findById(tenant, userId);       // WHERE id = ? AND "companyId" = ?
usersRepository.update(tenant, userId, data);   // returns null across tenants
```

There is deliberately **no** generic `findById(model, id)` helper. A convenience
wrapper that *can* run unscoped is one that eventually *will*.

Repositories: `users`, `roles`, `permission-templates`, `activity-logs`,
`companies`. `permissions` is intentionally unscoped — the catalogue is global
and identical for every company; only the grants differ.

### Why not Row-Level Security

PostgreSQL RLS was evaluated and **not** adopted in this phase. Enforcing it
requires a transaction-scoped `SET LOCAL app.company_id` on every query, which
is unreliable across Prisma's connection pool and interactive transactions —
and when it is missed it fails **open**, silently. An isolation control that
degrades silently is worse than one enforced where it can be tested.

The application-level protections in its place:

- `companyId` is a required argument on every tenant-scoped repository function.
- Single-row reads and writes match on id **and** `companyId`.
- Writes use `updateMany` with the composite filter, so a cross-tenant id
  affects zero rows rather than throwing something a caller might swallow.
- `tests/tenant-isolation.test.ts` proves Company A cannot read, list, update,
  change the status of, or soft delete a Company B record.

This is worth revisiting if the app ever gains raw SQL paths or a second
consumer of the database, where RLS would be defence in depth.

---

## Known limitations

These are deliberate boundaries after Phase 8:

- Bookings, payments, customers, vendors, supplier settlement, WhatsApp,
  telecalling and the final analytics dashboard are not implemented.
- Direct attachment upload with the in-memory development provider is not a
  browser transport; configure S3/a compatible endpoint for manual upload
  verification. Generated PDFs still work with the memory provider.
- Direct S3 uploads validate declared MIME, extension, size and confirmed object
  metadata, but do not yet run antivirus or magic-byte scanning.
- Delivery status reflects the synchronous SMTP provider result. Bounce/webhook
  reconciliation remains provider-specific future work.
- Company logo storage fields and PDF rendering hooks exist, but a dedicated
  branding-settings upload UI is not part of this phase.
- **No Row-Level Security** — see [Why not Row-Level Security](#why-not-row-level-security).
- **Soft-deleted rows keep unique identifiers** until an explicit anonymisation
  workflow is introduced.
- **Node 20+ required.** Vite 7 does not support Node 18 (which is EOL).
- **Prisma deprecation warning.** `package.json#prisma` warns that it moves to
  `prisma.config.ts` in Prisma 7. Deferred deliberately: adopting the config
  file changes `.env` loading semantics, which is better handled alongside the
  Phase 2 schema work.
- **An `esbuild` override is pinned** in the root `package.json` to keep
  `npm audit` at zero vulnerabilities. Revisit when `tsup` ships a newer
  esbuild.

---

## Roadmap

| Phase | Scope                                                                    | Status  |
| ----- | ------------------------------------------------------------------------ | ------- |
| **1** | Monorepo, toolchain, Tailwind, env validation, Docker, Prisma, health API | ✅ Done |
| **2** | Multi-tenant schema, constraints, tenant repositories, migration, seed    | ✅ Done |
| **3** | Registration, email OTP, login, logout, sessions, CSRF, password reset, shell | ✅ Done |
| **4** | User management: list, CRUD, status transitions, admin password reset     | ✅ Done |
| **5** | Roles, permission keys, templates, guards and permission-aware sidebar    | ✅ Done |
| **6** | Travel lead/query management, analytics and filtering                    | ✅ Done |
| **7** | Lead workspace, notes, follow-ups, timeline and reminders                 | ✅ Done |
| **8** | Quotation templates, immutable quotations, PDF, email, public links, S3    | ✅ Done |
| 9     | Booking conversion and booking operations (no payment collection initially) | Recommended next |

---

## License

UNLICENSED — private project.
