import { PrismaClient } from '@prisma/client';
import { env, isDevelopment } from './env.js';
import { logger } from './logger.js';

/**
 * Single PrismaClient for the process. Cached on globalThis so `tsx watch`
 * hot-reloads do not open a new connection pool on every file change.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    log: isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (isDevelopment) {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.debug('Prisma client disconnected');
}
