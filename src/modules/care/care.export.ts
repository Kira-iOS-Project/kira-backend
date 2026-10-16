/**
 * Kira Peduli's part of the data export: the check-ins, when Mode Darurat Utang was turned on,
 * and, in the download only (`ExportScope`), the safety plan opened for its own person. Crisis
 * signals are never exported.
 * Each section is `{ title, header, rows }`, which the account module writes after the
 * transactions; the words are Indonesian like the rest of the export.
 */

import type { ExportScope, ExportSection } from '../../lib/export/export-section.ts';
import { type CareRepository, careRepository } from './care.repository.ts';
import { exportKey, readablePlan } from './care.safety-plan.service.ts';

type ExportDeps = { repository?: CareRepository; key?: () => Promise<CryptoKey> };

/** The sections with something in them, in a fixed order. */
export async function careExportSections(
  userId: string,
  scope: ExportScope,
  deps: ExportDeps = {},
): Promise<ExportSection[]> {
  const repository = deps.repository ?? careRepository;
  const [checkIns, activatedAt, plan] = await Promise.all([
    repository.listCheckIns(userId),
    repository.findDebtEmergency(userId),
    /** The emailed export never reads the plan, so it cannot carry it. */
    scope.safetyPlan ? repository.findSafetyPlan(userId) : null,
  ]);
  const sections: ExportSection[] = [];
  if (checkIns.length > 0) {
    sections.push({
      title: 'Kira Peduli · Check-in',
      header: ['dijadwalkan', 'waktu', 'status', 'dilihat'],
      rows: checkIns.map((row) => [
        row.createdAt.toISOString(),
        row.dueAt.toISOString(),
        row.status,
        row.seenAt?.toISOString() ?? '',
      ]),
    });
  }
  if (activatedAt) {
    sections.push({
      title: 'Kira Peduli · Mode Darurat Utang',
      header: ['aktif_sejak'],
      rows: [[activatedAt.toISOString()]],
    });
  }
  const opened = plan ? await readablePlan(plan, await (deps.key ?? exportKey)()) : null;
  if (opened) {
    sections.push({
      title: 'Kira Peduli · Rencana Keselamatanku',
      header: ['bagian', 'isi'],
      rows: [
        ['tanda_peringatan', opened.warningSigns],
        ['yang_menenangkan', opened.calmingThings],
        ...opened.people.map((person) => [
          'orang_terdekat',
          `${person.name} ${person.phone}`.trim(),
        ]),
        ...opened.professionals.map((person) => [
          'tenaga_profesional',
          `${person.name} ${person.phone}`.trim(),
        ]),
        ['tempat_aman', opened.safePlace],
        ['diperbarui', opened.updatedAt],
      ],
    });
  }
  return sections;
}
