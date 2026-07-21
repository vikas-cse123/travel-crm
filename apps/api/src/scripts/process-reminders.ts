import { disconnectPrisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { reminderProcessor } from '../modules/reminders/reminder-processor.service.js';

try {
  const results = await reminderProcessor.processAll();
  logger.info({ companies: results.length, results }, 'Reminder processing completed');
} catch (error) {
  logger.fatal({ err: error }, 'Reminder processing failed');
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
