# Go-Live Checklist

Work top to bottom. Do not launch with any unchecked blocker.

## Build & pipeline

- [ ] CI is green on the release commit (typecheck, lint, format, tests, build)
- [ ] Production build completed (API image, web bundle)
- [ ] API and web images pushed to the registry with an immutable tag

## Data & storage

- [ ] Database automated backups enabled
- [ ] Point-in-time recovery enabled
- [ ] Restore tested into a scratch database (BACKUP_AND_RESTORE.md)
- [ ] S3 bucket is private (Block Public Access = ON), SSE enabled
- [ ] IAM role/policy for S3 tested (upload + download work)

## Network & TLS

- [ ] DNS configured for app + api hostnames
- [ ] SSL/TLS certificates active; HTTP redirects to HTTPS
- [ ] Web and API share a registrable domain (SameSite cookies)

## Configuration

- [ ] All production environment variables set and validated (API boots)
- [ ] Secrets sourced from the secrets manager, not files
- [ ] `VITE_API_URL` baked into the web bundle points at the https API
- [ ] SES/SMTP out of sandbox; SPF/DKIM/DMARC published

## Migrations

- [ ] Pre-deploy database snapshot taken
- [ ] `prisma migrate deploy` applied successfully

## Runtime health

- [ ] API liveness `GET /api/health` returns ok
- [ ] API readiness `GET /api/health/db` returns database up
- [ ] Web page loads over HTTPS

## Functional smoke (no data mutation)

- [ ] Login tested (round-trip via `npm run smoke:prod`)
- [ ] Company logo and PDF generation tested
- [ ] File upload tested (presigned upload + download)
- [ ] Reminder scheduler tested (worker runs, advisory lock respected)
- [ ] SMTP tested (a real OTP / reset email is received)
- [ ] Financial permission gating tested (costing hidden from non-financial role)
- [ ] Tenant isolation sanity tested (a second company cannot see the first's data)
- [ ] `npm run smoke:prod` passes end to end

## Operability

- [ ] Rollback rehearsed (ROLLBACK.md)
- [ ] Monitoring alerts configured and test-fired (MONITORING.md)
