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
    expect(sections.map((section) => section.header)).toEqual([
      [
        'Tanggal',
        'Jam',
        'Tanggal Check-in',
        'Jam Check-in',
        'Status',
        'Tanggal Dilihat',
        'Jam Dilihat',
      ],
      ['Tanggal Aktif', 'Jam Aktif'],
      ['Bagian', 'Isi'],
    ]);
    /** 05.41 UTC is 12.41 WIB; the states read as the words people see. */
    expect(sections[0]?.rows).toEqual([
      ['2026-10-17', '12.41', '2026-10-17', '12.41', 'Sudah Dilihat', '2026-10-17', '12.41'],
      ['2026-10-17', '12.41', '2026-10-17', '12.41', 'Terjadwal', '', ''],
    ]);
    expect(sections[1]?.rows).toEqual([['2026-10-17', '12.41']]);
    expect(sections[2]?.rows).toContainEqual(['Orang Terdekat', 'Rina 081234567890']);
    expect(sections[2]?.rows).toContainEqual(['Tenaga Profesional', 'Healing119 119']);
    expect(sections[2]?.rows).toContainEqual(['Tempat Aman', 'Rumah ibu']);
    expect(sections[2]?.rows.slice(-2)).toEqual([
      ['Tanggal Diperbarui', '2026-10-17'],
      ['Jam Diperbarui', '12.41'],
    ]);
    expect(JSON.stringify(sections)).not.toContain(CHECK_IN_STATUS.scheduled);
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
