import { disconnectPrisma, prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { reminderProcessor } from '../modules/reminders/reminder-processor.service.js';
import {
  tryAcquireReminderLock,
  type ReminderLockHandle,
} from '../modules/reminders/reminder-lock.js';

/**
 * Entry point for the scheduled reminder worker.
 *
 * SCHEDULING: run this on an external scheduler (cron, ECS scheduled task,
 * EventBridge Scheduler, Kubernetes CronJob) every few minutes. There is no
 * in-process timer by design. Overlapping runs are safe: a PostgreSQL advisory
 * lock guarantees only one worker processes at a time — a second concurrent run
 * simply logs and exits 0 without touching data. Do not schedule it more often
 * than a run typically takes to complete.
 */
let lock: ReminderLockHandle | null = null;
try {
  lock = await tryAcquireReminderLock(prisma);
  if (!lock) {
    logger.info('Another reminder worker holds the advisory lock; exiting without processing.');
  } else {
    const results = await reminderProcessor.processAll();
    logger.info({ companies: results.length, results }, 'Reminder processing completed');
  }
} catch (error) {
  logger.fatal({ err: error }, 'Reminder processing failed');
  process.exitCode = 1;
} finally {
  if (lock) {
    try {
      await lock.release();
    } catch (releaseError) {
      // Not fatal: the lock is released anyway when the connection closes below.
      logger.error({ err: releaseError }, 'Failed to release reminder advisory lock');
    }
  }
  await disconnectPrisma();
}
