import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { disconnectPrisma } from './config/prisma.js';

const app = createApp();

const server = app.listen(env.API_PORT, () => {
  logger.info(
    `Interscale Travel CRM API listening on ${env.API_URL} (${env.NODE_ENV}) — health: ${env.API_URL}/api/health`,
  );
});

/**
 * Drain in-flight requests before closing the database pool, so a deploy or
 * Ctrl-C never severs a request mid-transaction.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received, closing server');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, 'Error while closing HTTP server');
    }
    try {
      await disconnectPrisma();
    } catch (disconnectError) {
      logger.error({ err: disconnectError }, 'Error while disconnecting Prisma');
    }
    clearTimeout(forceExit);
    process.exit(error ? 1 : 0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException');
});

export { app, server };
