/**
 * The Kira Score's part of the data export: every snapshot taken of the person's score, from the
 * health check, a payday re-check or Riwayat Kira Score's monthly point, worded like the rest of
 * Unduh Datamu: Title Case Indonesian headers, WIB dates and clock times, and the words people read
 * instead of stored values.
 */

import { SCORE_BAND, SNAPSHOT_REASON } from '../../lib/constants/score.ts';
import type { ExportSection } from '../../lib/export/export-section.ts';
import { wibDate, wibTime } from '../../lib/time/wib.ts';
import { scoreHistoryRepository, type ScoreHistoryRepository } from './score.history.repository.ts';

type Values<T> = T[keyof T];

/** The band as Kira Score names it. */
const BAND_LABEL: Record<Values<typeof SCORE_BAND>, string> = {
  [SCORE_BAND.vulnerable]: 'Rentan',
  [SCORE_BAND.coping]: 'Bertahan',
  [SCORE_BAND.healthy]: 'Sehat',
};

/** Why the snapshot was taken, in the words of the score screens. */
const REASON_LABEL: Record<Values<typeof SNAPSHOT_REASON>, string> = {
  [SNAPSHOT_REASON.healthCheck]: 'Cek Kesehatan',
  [SNAPSHOT_REASON.recompute]: 'Dicek Ulang Saat Gajian',
  [SNAPSHOT_REASON.monthly]: 'Riwayat Bulanan',
};

/** One section when there is a snapshot, none before the health check. */
export async function scoreExportSections(
  userId: string,
  deps: { repository?: ScoreHistoryRepository } = {},
): Promise<ExportSection[]> {
  const repository = deps.repository ?? scoreHistoryRepository;
  const snapshots = await repository.listSnapshots(userId);
  if (snapshots.length === 0) return [];
  return [
    {
      title: 'Kira Score · Riwayat',
      header: ['Tanggal', 'Jam', 'Kira Score', 'Kondisi', 'Sebab'],
      rows: snapshots.map((snapshot) => [
        wibDate(snapshot.createdAt),
        wibTime(snapshot.createdAt),
        String(snapshot.score),
        BAND_LABEL[snapshot.band],
        REASON_LABEL[snapshot.reason],
      ]),
    },
  ];
}
