import type { PrismaClient } from '@prisma/client';

/**
 * Cross-process mutual exclusion for the reminder worker, built on a PostgreSQL
 * session-level advisory lock. No table is involved — the lock lives in the
 * database's shared memory and is released automatically when the holding
 * connection closes, which is the backstop if a worker dies mid-run.
 *
 * The two integers below are the lock's identity. EVERY process that runs the
 * reminder job must use exactly these values, or two workers could run at once.
 * The (classId, objId) two-argument form avoids the 64-bit precision pitfalls of
 * passing a bigint from JavaScript.
 */
export const REMINDER_LOCK_CLASS_ID = 0x5245_4d44; // ASCII "REMD" (1380142916, fits int4)
export const REMINDER_LOCK_OBJECT_ID = 1;

/** A held advisory lock. Call `release()` once the protected work is done. */
export interface ReminderLockHandle {
  release(): Promise<void>;
}

type RawClient = Pick<PrismaClient, '$queryRaw'>;

/**
 * Try to acquire the reminder advisory lock without blocking.
 *
 * Returns a handle when the lock is ours, or `null` when another session
 * already holds it — the caller should then exit successfully without
 * processing. The lock is held on the connection the acquiring query ran on and
 * persists for the life of that connection; `release()` is best-effort and the
 * connection closing (worker disconnect / crash) is the guaranteed release.
 */
export async function tryAcquireReminderLock(
  client: RawClient,
): Promise<ReminderLockHandle | null> {
  const rows = await client.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${REMINDER_LOCK_CLASS_ID}::int, ${REMINDER_LOCK_OBJECT_ID}::int) AS locked`;

  if (rows[0]?.locked !== true) return null;

  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      await client.$queryRaw`
        SELECT pg_advisory_unlock(${REMINDER_LOCK_CLASS_ID}::int, ${REMINDER_LOCK_OBJECT_ID}::int)`;
    },
  };
}
