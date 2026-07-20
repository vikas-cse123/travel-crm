import { Router } from 'express';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';

/**
 * Single mount point for every module router.
 * Phase 4+ adds: users, roles, permission-templates, activity-logs and
 * companies.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);

export { router as apiRoutes };
