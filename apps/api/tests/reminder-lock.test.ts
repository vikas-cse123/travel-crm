import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, resolveTestDatabaseUrl } from './helpers/test-database.js';
import { tryAcquireReminderLock } from '../src/modules/reminders/reminder-lock.js';

/**
 * The advisory lock is what keeps two overlapping reminder-worker runs from
 * processing at the same time. Two separate clients simulate two workers: each
 * has a single connection so acquire and release land on the same session.
 */

function singleConnectionClient(): PrismaClient {
  const url = new URL(resolveTestDatabaseUrl());
  url.searchParams.set('connection_limit', '1');
  return createTestPrismaClient(url.toString());
}

let workerA: PrismaClient;
let workerB: PrismaClient;

beforeAll(() => {
  workerA = singleConnectionClient();
  workerB = singleConnectionClient();
});

afterAll(async () => {
  await workerA.$disconnect();
  await workerB.$disconnect();
});

describe('reminder worker advisory lock', () => {
  it('grants the lock to one worker and blocks a concurrent worker', async () => {
    const held = await tryAcquireReminderLock(workerA);
    expect(held).not.toBeNull();

    // A second, independent worker session cannot acquire while A holds it.
    const blocked = await tryAcquireReminderLock(workerB);
    expect(blocked).toBeNull();

    // After A releases, the lock becomes available again.
    await held!.release();
    const reacquired = await tryAcquireReminderLock(workerB);
    expect(reacquired).not.toBeNull();
    await reacquired!.release();
  });

  it('release is idempotent', async () => {
    const held = await tryAcquireReminderLock(workerA);
    expect(held).not.toBeNull();
    await held!.release();
    await expect(held!.release()).resolves.toBeUndefined();
  });
});
