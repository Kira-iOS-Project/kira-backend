import { describe, expect, test } from 'bun:test';
import { CHECK_IN_STATUS } from '../../../lib/constants/care.ts';
import { seal } from '../care.crypto.ts';
import { careExportSections } from '../care.export.ts';
import {
  CHECK_IN_ID,
  createCareRepositoryMock,
  createPlan,
  NOW,
  testKey,
  USER_ID,
} from './helpers.ts';

const DOWNLOAD = { safetyPlan: true };

describe('careExportSections', () => {
  test('nothing to export gives no section', async () => {
    expect(
      await careExportSections(USER_ID, DOWNLOAD, { repository: createCareRepositoryMock() }),
    ).toEqual([]);
  });

  test('exports check-ins, the debt emergency time and the opened plan, never signals', async () => {
    const key = await testKey();
    const sealed = await seal(key, JSON.stringify(createPlan()));
    const repository = createCareRepositoryMock({
      listCheckIns: async () => [
        { id: CHECK_IN_ID, dueAt: NOW, status: CHECK_IN_STATUS.seen, seenAt: NOW, createdAt: NOW },
        { id: 'c2', dueAt: NOW, status: CHECK_IN_STATUS.scheduled, seenAt: null, createdAt: NOW },
      ],
      findDebtEmergency: async () => NOW,
      findSafetyPlan: async () => ({ sealed, updatedAt: NOW }),
    });

    const sections = await careExportSections(USER_ID, DOWNLOAD, {
      repository,
      key: async () => key,
    });

    expect(sections.map((section) => section.title)).toEqual([
      'Kira Peduli · Check-in',
      'Kira Peduli · Mode Darurat Utang',
      'Kira Peduli · Rencana Keselamatanku',
    ]);
    expect(sections[0]?.rows[1]).toEqual([
      NOW.toISOString(),
      NOW.toISOString(),
      CHECK_IN_STATUS.scheduled,
      '',
    ]);
    expect(sections[1]?.rows).toEqual([[NOW.toISOString()]]);
    expect(sections[2]?.rows).toContainEqual(['orang_terdekat', 'Rina 081234567890']);
    expect(sections[2]?.rows).toContainEqual(['tempat_aman', 'Rumah ibu']);
    expect(JSON.stringify(sections)).not.toContain('signal');
  });

  test('never reads the plan for the emailed export', async () => {
    let read = false;
    const repository = createCareRepositoryMock({
      findDebtEmergency: async () => NOW,
      findSafetyPlan: async () => {
        read = true;
        return { sealed: 'v1.a.b', updatedAt: NOW };
      },
    });

    const sections = await careExportSections(USER_ID, { safetyPlan: false }, { repository });

    expect(sections.map((section) => section.title)).toEqual(['Kira Peduli · Mode Darurat Utang']);
    expect(read).toBe(false);
  });

  test('leaves out a plan that cannot be opened', async () => {
    const repository = createCareRepositoryMock({
      findSafetyPlan: async () => ({ sealed: 'v1.a.b', updatedAt: NOW }),
    });
    expect(await careExportSections(USER_ID, DOWNLOAD, { repository, key: testKey })).toEqual([]);
  });
});
