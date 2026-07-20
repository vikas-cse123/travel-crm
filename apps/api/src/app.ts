import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { API_PREFIX } from '@interscale/shared';
import { env, isProduction, isTest } from './config/env.js';
import { logger } from './config/logger.js';
import { requestId } from './middleware/request-id.js';
import { globalLimiter } from './middleware/rate-limiters.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { verifyCsrfToken, verifyOrigin } from './middleware/csrf.js';
import { apiRoutes } from './routes.js';

export function createApp(): Express {
  const app = express();

  // Behind a load balancer this is what makes req.ip (and rate limiting) honest.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);

  app.use(
    helmet({
      // The API serves JSON only; CSP is enforced by the web app's host.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // Credentials are on, so the origin must be an explicit allow-list.
  app.use(
    cors({
      origin: [env.WEB_URL],
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-CSRF-Token'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  // Body-size caps blunt trivial memory-exhaustion attempts.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser(env.SESSION_SECRET));

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => req.id as string,
        autoLogging: { ignore: (req) => req.url === `${API_PREFIX}/health` },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      }),
    );
  }

  app.use(globalLimiter);

  // CSRF runs before the routes and before authentication, so a forged
  // state-changing request is rejected before it can touch any handler.
  // Layer 1 covers requests with no session (register, login); layer 2 covers
  // everything that carries one. See middleware/csrf.ts.
  app.use(verifyOrigin);
  app.use(verifyCsrfToken);

  app.use(API_PREFIX, apiRoutes);

  // Order matters: unmatched routes, then the terminal error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.debug({ environment: env.NODE_ENV, production: isProduction }, 'Express app created');

  return app;
}
