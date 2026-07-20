import type { DbHealthResponse, HealthResponse } from '@interscale/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { healthRepository } from './health.repository.js';

const SERVICE_NAME = 'interscale-api';
const SERVICE_VERSION = '0.1.0';

export const healthService = {
  /** Liveness. Intentionally does no I/O. */
  getStatus(): HealthResponse {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Readiness. Returns `down` rather than throwing so the endpoint can report
   * a degraded database instead of failing opaquely.
   */
  async getDatabaseStatus(): Promise<DbHealthResponse> {
    const startedAt = process.hrtime.bigint();
    try {
      await healthRepository.ping();
      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      return {
        database: 'up',
        latencyMs: Math.round(latencyMs * 100) / 100,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Database health check failed');
      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      return {
        database: 'down',
        latencyMs: Math.round(latencyMs * 100) / 100,
        timestamp: new Date().toISOString(),
      };
    }
  },
};
