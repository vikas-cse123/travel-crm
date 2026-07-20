import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { healthService } from './health.service.js';

export const healthController = {
  getStatus(_req: Request, res: Response): void {
    sendSuccess(res, healthService.getStatus(), 'API is healthy.');
  },

  async getDatabaseStatus(_req: Request, res: Response): Promise<void> {
    const result = await healthService.getDatabaseStatus();
    // 503 when the database is unreachable so orchestrators can act on it.
    const statusCode = result.database === 'up' ? 200 : 503;
    sendSuccess(
      res,
      result,
      result.database === 'up' ? 'Database connection is healthy.' : 'Database is unreachable.',
      statusCode,
    );
  },
};
