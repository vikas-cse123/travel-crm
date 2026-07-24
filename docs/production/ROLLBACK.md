# Rollback Runbook

Interscale Travel CRM uses **forward-only** Prisma migrations. There is **no
automatic down migration**. Plan rollbacks accordingly.

## Golden rules

- **Never** manually edit or delete rows in `_prisma_migrations`, and never
  hand-alter production schema. The migration history is append-only.
- Always take a **pre-deploy database snapshot** (see BACKUP_AND_RESTORE.md).
- Keep every migration **backward-compatible** with the currently running app
  version (expand-then-contract): add columns/tables as nullable/defaulted;
  remove or tighten only in a later release after the old code is gone. This is
  what makes a code-only rollback safe.

## Decision: code rollback vs database restore

1. **Was the schema changed in the failed deploy?**
   - **No** → code rollback is safe. Redeploy the previous image; done.
   - **Yes, additive & backward-compatible** → code rollback is still safe. The
     old code ignores the new columns/tables. Redeploy the previous image; you
     may leave the new schema in place and clean it up in a future forward
     migration.
   - **Yes, destructive / not backward-compatible** → a code rollback alone is
     unsafe. Restore the database from the pre-deploy snapshot (or PITR to just
     before the migration), then redeploy the matching previous image.

## Procedure — code rollback (most common)

1. Redeploy the previous, known-good API and web images (or previous CDN
   bundle). Keep env unchanged.
2. Verify: `npm run smoke:prod` (health, readiness, login round-trip).
3. Watch logs and error rates for a few minutes.

## Procedure — forward fix

Often faster than a restore when the issue is a bug, not data corruption:

1. Write a new migration/code change that corrects the problem.
2. Deploy through the normal path (snapshot → migrate → API → web → smoke).

## Procedure — database restore (destructive migration only)

1. Put the app in maintenance / stop writers if possible.
2. Restore the pre-deploy snapshot into a **new** instance and validate, or PITR
   the existing instance to the timestamp just before the migration. See
   BACKUP_AND_RESTORE.md.
3. Point `DATABASE_URL` at the restored instance (or promote it).
4. Deploy the previous application image that matches that schema.
5. Verify with `npm run smoke:prod` and spot-check recent records.
6. Note the data-loss window (writes between snapshot and restore are lost) and
   communicate it.

## After any rollback

- Run the smoke test.
- Confirm `/api/health` and `/api/health/db` are green.
- Confirm the reminder scheduler is still pointed at the running worker image.
- Record the incident and the root cause; add a regression test.
