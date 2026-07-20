# Interscale Travel CRM

A multi-tenant SaaS CRM for travel agencies.

> **Status: Phase 1 (Foundation) complete.**
> The monorepo, toolchain, database infrastructure and a working health-check
> vertical slice are in place and verified. Authentication, users, roles,
> permissions and the CRM modules are **not** built yet — see
> [Roadmap](#roadmap).

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
| `EMAIL_PROVIDER`                | `console` (dev) \| `smtp`                      |
| `EMAIL_FROM`, `SMTP_*`          | Outbound email settings                        |
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

### Schema scope

`apps/api/prisma/schema.prisma` currently contains **only** a `HealthCheck`
model. Its purpose is to prove that migrations, the generated client and the
live connection all work. The full multi-tenant domain schema — `Company`,
`User`, `Role`, `Permission`, `RolePermission`, `PermissionTemplate`,
`PermissionTemplatePermission`, `Session`, `EmailVerificationOtp`,
`PasswordResetToken`, `ActivityLog` and their enums — is **Phase 2**.

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

## Testing

```bash
npm test           # api + web
npm run test:api   # Vitest + Supertest
npm run test:web   # Vitest + React Testing Library (jsdom)
```

Backend tests exercise the real Express app through Supertest (envelope shape,
correlation ids, 404 handling, security headers). Frontend tests cover the
loading, success and error states of the status page against a stubbed fetch.

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

Every travel agency is a separate **company tenant**. The rules that Phase 2+
code must follow:

1. `companyId` is **always** derived from the authenticated session — never
   read from the request body, query string or URL.
2. Every company-owned query is scoped by `companyId`.
3. Reads and writes validate **both** the record id and the `companyId`, so a
   modified URL cannot reach another tenant's row.
4. Tenant-scoped repository helpers centralise this, rather than each service
   remembering to add a filter.
5. Multi-step critical actions run inside a database transaction.
6. Automated cross-tenant isolation tests gate the work.

The first person to register a company becomes its **Owner**.

---

## Known limitations

These are expected at this stage, not defects:

- **No authentication.** All Phase 1 routes are public. There is no login,
  signup, session or user record yet.
- **Domain schema not modelled.** Only `HealthCheck` exists in Prisma.
- **The `/` status page is temporary.** It exists to verify the stack and is
  replaced by `/login` and `/dashboard` in Phase 3.
- **No CRM layout yet** — no sidebar, topbar or breadcrumbs.
- **Email service is not implemented.** `EMAIL_PROVIDER` is validated and
  reserved; the abstraction lands in Phase 3.
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
| 2     | Multi-tenant Prisma schema, indexes, constraints, migrations, seed data   | Next    |
| 3     | Registration, email OTP, login, logout, sessions, password reset          | Planned |
| 4     | User management: list, CRUD, status transitions, admin password reset     | Planned |
| 5     | Roles, permission keys, templates, guards and permission-aware sidebar    | Planned |
| 6     | Integration + component tests, tenant-isolation tests, hardening          | Planned |

Deliberately **not** in scope until the above lands: travel queries,
follow-ups, quotations, bookings, payments, customers, vendors and reports.
They appear in the sidebar as "Coming soon" from Phase 5.

---

## License

UNLICENSED — private project.
