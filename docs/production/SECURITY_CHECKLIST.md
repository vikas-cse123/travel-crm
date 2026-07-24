# Production Security Checklist

Verify each item before and after go-live. Many controls already exist in code
(noted with ✅ and a file reference); the rest are deployment/configuration.

## Transport & cookies

- [ ] **HTTPS everywhere** — TLS terminated at the LB/CDN; HTTP redirects to
      HTTPS. Cookies are `Secure` only in production, so HTTPS is mandatory.
- [ ] ✅ **Secure cookies** — session cookie is `httpOnly`, `SameSite=Lax`,
      `Secure` in production (`apps/api/src/utils/cookies.ts`).
- [ ] **Same-site domain strategy** — web + API share a registrable domain
      (e.g. `app.example.com` + `api.example.com`) so `SameSite=Lax` cookies are
      sent on API calls.

## Application controls (already in code — confirm config)

- [ ] ✅ **CORS** — credentialed allow-list of `WEB_URL`
      (`apps/api/src/app.ts`); set `WEB_URL` to the real origin.
- [ ] ✅ **CSRF** — Origin allow-list + session-bound double-submit token
      (`apps/api/src/middleware/csrf.ts`).
- [ ] ✅ **Security headers** — Helmet enabled (`apps/api/src/app.ts`).
- [ ] ✅ **Rate limiting** — global + per-endpoint limiters
      (`apps/api/src/middleware/rate-limiters.ts`). Note: in-memory, per-instance
      (see MONITORING.md before scaling out).
- [ ] ✅ **Account lockout** — failed-login lockout via
      `LOGIN_MAX_FAILED_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES`.
- [ ] ✅ **Passwords** — Argon2id; **tokens** — HMAC-SHA256 keyed with
      `TOKEN_PEPPER` (`apps/api/src/utils/crypto.ts`).
- [ ] ✅ **Audit logs** — activity logging on state changes; ensure log
      retention meets policy.
- [ ] ✅ **File-size / MIME limits** — per-type upload caps and MIME allow-lists;
      100 kB JSON body cap.

## Secrets & keys

- [ ] **Secrets manager** — all secrets injected from AWS Secrets Manager / SSM,
      never committed. `.env` is git-ignored and `.dockerignore`-excluded.
- [ ] **Strong environment secrets** — `SESSION_SECRET`, `TOKEN_PEPPER` are real
      random 48-byte values (no `change_me`); `DATA_ENCRYPTION_KEY` is a real
      base64 32-byte key. Env validation refuses placeholders in production.
- [ ] **Key rotation** — documented process; keep prior `DATA_ENCRYPTION_KEY`
      versions to decrypt historical rows; rotating `TOKEN_PEPPER` logs everyone
      out (acceptable pre-launch).

## Infrastructure

- [ ] **S3 Block Public Access = ON**; default SSE enabled; no public ACLs.
- [ ] **Least-privilege IAM** — API/worker role limited to the specific bucket
      and actions; prefer an IAM role over static keys.
- [ ] **Database private networking** — no public endpoint; ingress only from
      the app security group; TLS to the database.
- [ ] **SMTP domain authentication** — SPF, DKIM, DMARC published; SES out of
      sandbox.

## Process

- [ ] **Dependency scanning** — the Security workflow runs `npm audit` and
      dependency review; triage high/critical findings.
- [ ] **Admin user review** — confirm only intended Owner/admin accounts exist;
      remove seed/demo accounts (they are never created in production, see next).
- [ ] ✅ **Production seed prohibition** — `apps/api/prisma/seed.ts` throws if
      `NODE_ENV=production`; confirm no seed step runs in the prod pipeline.
- [ ] **Backup verification** — automated backups + PITR enabled and a restore
      drill has passed (BACKUP_AND_RESTORE.md).
