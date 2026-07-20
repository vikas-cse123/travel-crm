import { prisma } from '../../config/prisma.js';

/**
 * Data access for health checks. Isolated in a repository so the service
 * stays free of Prisma specifics, matching every other module's layering.
 */
export const healthRepository = {
  /** Cheapest possible round-trip that proves the connection is usable. */
  async ping(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  },
};
