import { z } from 'zod';

/** Liveness: the process is up and serving. Does not touch the database. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  environment: z.string(),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Readiness: a real round-trip to PostgreSQL. */
export const dbHealthResponseSchema = z.object({
  database: z.enum(['up', 'down']),
  latencyMs: z.number(),
  timestamp: z.string(),
});

export type DbHealthResponse = z.infer<typeof dbHealthResponseSchema>;
