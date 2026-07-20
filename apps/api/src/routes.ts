import { Router } from 'express';
import { healthRoutes } from './modules/health/health.routes.js';

/**
 * Single mount point for every module router.
 * Phase 3+ adds: auth, users, roles, permissions, permission-templates,
 * activity-logs and companies.
 */
const router = Router();

router.use('/health', healthRoutes);

export { router as apiRoutes };
