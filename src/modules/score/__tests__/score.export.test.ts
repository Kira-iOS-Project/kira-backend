import { describe, expect, test } from 'bun:test';
import { SCORE_BAND, SNAPSHOT_REASON } from '../../../lib/constants/score.ts';
import { scoreExportSections } from '../score.export.ts';
import { createScoreHistoryRepositoryMock, NOW } from './helpers.ts';

describe('scoreExportSections', () => {
  test('nothing to export before the health check', async () => {
    const repository = createScoreHistoryRepositoryMock();
    expect(await scoreExportSections('user-1', { repository })).toEqual([]);
  });

  test('lists every snapshot with its band and reason in words', async () => {
    const repository = createScoreHistoryRepositoryMock({
      listSnapshots: async () => [
        {
          reason: SNAPSHOT_REASON.healthCheck,
          createdAt: NOW,
          score: 38,
          band: SCORE_BAND.vulnerable,
        },
        { reason: SNAPSHOT_REASON.recompute, createdAt: NOW, score: 66, band: SCORE_BAND.coping },
        { reason: SNAPSHOT_REASON.monthly, createdAt: NOW, score: 81, band: SCORE_BAND.healthy },
      ],
    });
    const [section] = await scoreExportSections('user-1', { repository });
    expect(section?.title).toBe('Kira Score · Riwayat');
    expect(section?.header).toEqual(['Tanggal', 'Jam', 'Kira Score', 'Kondisi', 'Sebab']);
    expect(section?.rows.map((row) => row.slice(2))).toEqual([
      ['38', 'Rentan', 'Cek Kesehatan'],
      ['66', 'Bertahan', 'Dicek Ulang Saat Gajian'],
      ['81', 'Sehat', 'Riwayat Bulanan'],
    ]);
  });
});
