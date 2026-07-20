import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
let app: Express, db: PrismaClient;
beforeAll(async () => {
  db = createTestPrismaClient();
  app = (await import('../src/app.js')).createApp();
});
afterAll(async () => db.$disconnect());
beforeEach(async () => {
  await truncateAll(db);
  getMemoryEmailProvider()?.clear();
});
async function owner(email: string, name: string) {
  const c = createAuthClient(app);
  await c.post('/api/auth/register', registrationPayload({ email, companyName: name }));
  await c.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return c;
}
async function setup() {
  const c = await owner('owner@alpha.test', 'Alpha');
  const catalog = (await c.get('/api/permissions')).body.data as Array<{
    permissions: Array<{ key: string; isAvailable: boolean }>;
  }>;
  return {
    c,
    catalog,
    available: catalog
      .flatMap((g) => g.permissions)
      .filter((p) => p.isAvailable)
      .map((p) => p.key),
  };
}
describe('roles, templates, permission catalog and activity administration', () => {
  it('returns the grouped catalog with available and planned permissions', async () => {
    const { catalog } = await setup();
    expect(catalog.length).toBeGreaterThan(5);
    expect(catalog.flatMap((g) => g.permissions).some((p) => p.isAvailable)).toBe(true);
    expect(catalog.flatMap((g) => g.permissions).some((p) => !p.isAvailable)).toBe(true);
  });
  it('creates, paginates, searches, edits and deletes a custom role with activity', async () => {
    const { c, available } = await setup();
    const created = await c.post('/api/roles', {
      name: 'Operations',
      description: 'Ops',
      hierarchyLevel: 60,
      permissions: available.slice(0, 2),
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect((await c.get('/api/roles?search=Operations&pageSize=1')).body.data.data).toHaveLength(1);
    expect((await c.patch(`/api/roles/${id}`, { description: 'Updated' })).status).toBe(200);
    expect((await c.delete(`/api/roles/${id}`)).status).toBe(200);
    expect(await db.activityLog.count({ where: { entityId: id } })).toBe(3);
  });
  it('rejects duplicate roles, unavailable permissions and invalid hierarchy', async () => {
    const { c, catalog } = await setup();
    const unavailable = catalog.flatMap((g) => g.permissions).find((p) => !p.isAvailable)!.key;
    const body = { name: 'Ops', hierarchyLevel: 60, permissions: [] };
    expect((await c.post('/api/roles', body)).status).toBe(201);
    expect((await c.post('/api/roles', body)).status).toBe(409);
    expect(
      (await c.post('/api/roles', { ...body, name: 'Future', permissions: [unavailable] })).status,
    ).toBe(400);
    expect(
      (await c.post('/api/roles', { ...body, name: 'Owner clone', hierarchyLevel: 100 })).status,
    ).toBe(400);
  });
  it('protects system roles and roles assigned to users', async () => {
    const { c } = await setup();
    const roles = (await c.get('/api/roles')).body.data.data;
    const ownerRole = roles.find((r: { name: string }) => r.name === 'Owner');
    expect((await c.delete(`/api/roles/${ownerRole.id}`)).status).toBe(403);
    const custom = (
      await c.post('/api/roles', { name: 'Assigned', hierarchyLevel: 20, permissions: [] })
    ).body.data;
    const ownerRow = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@alpha.test' },
    });
    await db.user.create({
      data: {
        companyId: ownerRow.companyId,
        roleId: custom.id,
        username: 'assigned-user',
        fullName: 'Assigned User',
        email: 'assigned@alpha.test',
        normalizedEmail: 'assigned@alpha.test',
        passwordHash: ownerRow.passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    expect((await c.delete(`/api/roles/${custom.id}`)).status).toBe(409);
  });
  it('enforces backend permissions independently of navigation', async () => {
    await setup();
    const ownerRow = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@alpha.test' },
    });
    const managerRole = await db.role.findFirstOrThrow({
      where: { companyId: ownerRow.companyId, name: 'Manager' },
    });
    await db.user.create({
      data: {
        companyId: ownerRow.companyId,
        roleId: managerRole.id,
        username: 'manager-test',
        fullName: 'Manager Test',
        email: 'manager@alpha.test',
        normalizedEmail: 'manager@alpha.test',
        passwordHash: ownerRow.passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const manager = createAuthClient(app);
    await manager.post('/api/auth/login', {
      email: 'manager@alpha.test',
      password: 'Interscale@2026',
    });
    expect((await manager.get('/api/roles')).status).toBe(200);
    expect(
      (await manager.post('/api/roles', { name: 'Forbidden', hierarchyLevel: 20, permissions: [] }))
        .status,
    ).toBe(403);
    expect(
      (
        await manager.post('/api/permission-templates', {
          name: 'Forbidden',
          status: 'ACTIVE',
          permissions: [],
        })
      ).status,
    ).toBe(403);
  });
  it('isolates every role operation by company', async () => {
    const a = await owner('owner@alpha.test', 'Alpha');
    const b = await owner('owner@beta.test', 'Beta');
    const role = (
      await b.post('/api/roles', { name: 'Beta role', hierarchyLevel: 20, permissions: [] })
    ).body.data;
    expect((await a.get(`/api/roles/${role.id}`)).status).toBe(404);
    expect((await a.patch(`/api/roles/${role.id}`, { description: 'x' })).status).toBe(404);
    expect((await a.delete(`/api/roles/${role.id}`)).status).toBe(404);
    expect(
      (await a.get('/api/roles')).body.data.data.some((r: { id: string }) => r.id === role.id),
    ).toBe(false);
  });
  it('creates, filters, edits, duplicates and changes template status', async () => {
    const { c, available } = await setup();
    const t = (
      await c.post('/api/permission-templates', {
        name: 'Custom sales',
        description: 'x',
        status: 'ACTIVE',
        permissions: available.slice(0, 2),
      })
    ).body.data;
    expect(
      (await c.get('/api/permission-templates?search=Custom&status=ACTIVE&pageSize=1')).body.data
        .data,
    ).toHaveLength(1);
    expect(
      (await c.patch(`/api/permission-templates/${t.id}`, { description: 'updated' })).status,
    ).toBe(200);
    const copy = (await c.post(`/api/permission-templates/${t.id}/duplicate`)).body.data;
    expect(copy.name).toContain('Copy');
    expect(copy.status).toBe('INACTIVE');
    expect(
      (await c.patch(`/api/permission-templates/${t.id}/status`, { status: 'INACTIVE' })).status,
    ).toBe(200);
  });
  it('rejects assigned template deletion and soft deletes an unassigned template', async () => {
    const { c } = await setup();
    const assigned = (
      await c.post('/api/permission-templates', {
        name: 'Assigned',
        status: 'ACTIVE',
        permissions: [],
      })
    ).body.data;
    await db.user.update({
      where: { normalizedEmail: 'owner@alpha.test' },
      data: { permissionTemplateId: assigned.id },
    });
    expect((await c.delete(`/api/permission-templates/${assigned.id}`)).status).toBe(409);
    const t = (
      await c.post('/api/permission-templates', {
        name: 'Delete me',
        status: 'ACTIVE',
        permissions: [],
      })
    ).body.data;
    expect((await c.delete(`/api/permission-templates/${t.id}`)).status).toBe(200);
    expect(
      (await db.permissionTemplate.findUniqueOrThrow({ where: { id: t.id } })).deletedAt,
    ).not.toBeNull();
  });
  it('revokes only sessions of users assigned to a changed template', async () => {
    const { c } = await setup();
    const t = (
      await c.post('/api/permission-templates', {
        name: 'Session template',
        status: 'ACTIVE',
        permissions: ['dashboard.view'],
      })
    ).body.data;
    const ownerRow = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@alpha.test' },
    });
    await db.user.update({ where: { id: ownerRow.id }, data: { permissionTemplateId: t.id } });
    await db.session.create({
      data: {
        userId: ownerRow.id,
        tokenHash: 'f'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await c.patch(`/api/permission-templates/${t.id}/status`, { status: 'INACTIVE' });
    expect(await db.session.count({ where: { userId: ownerRow.id, revokedAt: null } })).toBe(0);
  });
  it('isolates every permission-template operation by company', async () => {
    const a = await owner('owner@alpha.test', 'Alpha');
    const b = await owner('owner@beta.test', 'Beta');
    const t = (
      await b.post('/api/permission-templates', {
        name: 'Beta only',
        status: 'ACTIVE',
        permissions: [],
      })
    ).body.data;
    expect((await a.get(`/api/permission-templates/${t.id}`)).status).toBe(404);
    expect((await a.patch(`/api/permission-templates/${t.id}`, { description: 'x' })).status).toBe(
      404,
    );
    expect((await a.post(`/api/permission-templates/${t.id}/duplicate`)).status).toBe(404);
    expect(
      (await a.patch(`/api/permission-templates/${t.id}/status`, { status: 'INACTIVE' })).status,
    ).toBe(404);
    expect((await a.delete(`/api/permission-templates/${t.id}`)).status).toBe(404);
  });
  it('returns tenant activity newest first and redacts sensitive metadata', async () => {
    const { c } = await setup();
    const u = await db.user.findFirstOrThrow({ where: { normalizedEmail: 'owner@alpha.test' } });
    await db.activityLog.create({
      data: {
        companyId: u.companyId,
        actorUserId: u.id,
        action: 'USER_UPDATED',
        entityType: 'User',
        entityId: u.id,
        metadata: { password: 'secret', safe: 'visible' },
      },
    });
    const result = await c.get(
      `/api/activity-logs?actorUserId=${u.id}&action=USER_UPDATED&pageSize=1`,
    );
    expect(result.status).toBe(200);
    expect(result.body.data.data[0].metadata).toEqual({ safe: 'visible' });
    expect(
      (
        await owner('owner@beta.test', 'Beta').then((x) => x.get('/api/activity-logs'))
      ).body.data.data.some((e: { entityId: string }) => e.entityId === u.id),
    ).toBe(false);
  });
});
