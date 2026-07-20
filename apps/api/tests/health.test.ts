import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('returns a success envelope with service metadata', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      status: 'ok',
      service: 'interscale-api',
    });
    expect(typeof response.body.data.uptimeSeconds).toBe('number');
  });

  it('echoes a correlation id on every response', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('reuses an inbound correlation id', async () => {
    const response = await request(app).get('/api/health').set('x-request-id', 'trace-abc-123');
    expect(response.headers['x-request-id']).toBe('trace-abc-123');
  });
});

describe('error handling', () => {
  it('returns the failure envelope for an unknown route', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toBeTruthy();
  });
});

describe('security headers', () => {
  it('applies helmet and removes x-powered-by', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
