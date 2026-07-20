import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { healthController } from './health.controller.js';

const router = Router();

/** GET /api/health - liveness. */
router.get('/', healthController.getStatus);

/** GET /api/health/db - readiness, performs a real query. */
router.get('/db', asyncHandler(healthController.getDatabaseStatus));

export { router as healthRoutes };
