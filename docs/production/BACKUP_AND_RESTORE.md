# Backup & Restore Runbook

Protects the two stateful stores: **PostgreSQL** (all business data) and **S3**
(private documents/images). The database is the primary recovery concern.

> Fill in the `<placeholders>` for your environment and keep this document
> current. Never commit real credentials or hostnames with secrets.

## Objectives (fill in)

- **RPO** (max acceptable data loss): `<e.g. 5 minutes via PITR>`
- **RTO** (max acceptable downtime): `<e.g. 1 hour>`
- **Retention**: automated backups `<e.g. 14 days>`; monthly snapshot `<e.g. 12 months>`

## PostgreSQL — managed automated backups

- Enable **automated backups** and **point-in-time recovery (PITR)** on the
  managed instance (RDS/Aurora/Cloud SQL). Set the retention window to meet RPO.
- Enable storage encryption at rest and encrypted snapshots.
- Automated backups cover disaster recovery; the manual snapshot below covers
  deployments specifically.

## PostgreSQL — manual pre-deployment snapshot

Always snapshot immediately before applying migrations:

- Managed: create a named manual snapshot, e.g. `pre-deploy-<version>-<date>`.
- Self-managed / logical: see the `pg_dump` command below.

## PostgreSQL — logical backup (portable)

```
pg_dump --format=custom --no-owner --no-privileges \
  --file "interscale-$(date +%Y%m%d-%H%M).dump" "$DATABASE_URL"
```

Store the dump in a private, versioned bucket with lifecycle expiry. The dump
contains business data — treat it as sensitive.

## PostgreSQL — restore into a SEPARATE database (safe validation)

Never restore over the live database while validating. Restore into a scratch
database first:

```
createdb interscale_restore_check
pg_restore --no-owner --no-privileges \
  --dbname "postgresql://USER:PASS@HOST:5432/interscale_restore_check" \
  interscale-YYYYMMDD-HHMM.dump
```

For managed PITR: restore to a **new** instance at the target timestamp, then
validate before repointing `DATABASE_URL`.

## Validation after restore

- Row-count sanity on core tables (companies, users, bookings, quotations).
- `SELECT max("createdAt")` on recent tables to confirm the recovery point.
- Boot the API against the restored DB and run `npm run smoke:prod`
  (health + readiness + a login round-trip).
- Confirm a document download works — this proves the **encryption-key
  dependency** below is satisfied.

## Encryption-key dependency (critical)

Sensitive fields (e.g. passport numbers) are encrypted with
`DATA_ENCRYPTION_KEY` (AES-256-GCM, versioned by `DATA_ENCRYPTION_KEY_VERSION`).
**A database restore is useless without the matching key.** Back up and store
the key(s) in the secrets manager with the same rigor and retention as the
database. Never rotate the key without keeping the prior version available to
decrypt historical rows.

## S3 documents

- Enable **bucket versioning** so overwritten/deleted objects are recoverable.
- Add lifecycle rules: expire noncurrent versions after `<e.g. 90 days>`;
  optionally transition cold objects to cheaper storage.
- Consider cross-region replication for DR if required by RTO.

## Restore drill (quarterly)

Once a quarter, perform a full rehearsal and record the result:

1. Restore the latest backup into a scratch database.
2. Boot the API against it; run `npm run smoke:prod`.
3. Decrypt one sensitive field to prove the key works.
4. Record elapsed time (actual RTO) and any gaps; update this runbook.

## Emergency contacts (fill in)

- Primary on-call: `<name / pager>`
- Database owner: `<name / team>`
- Cloud account owner: `<name / team>`
- Escalation: `<manager / vendor support plan>`
