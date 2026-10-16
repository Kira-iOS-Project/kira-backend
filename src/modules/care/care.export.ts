/**
 * Kira Peduli's part of the data export (GET /me/export): the check-ins, when Mode Darurat Utang
 * was turned on, and the safety plan opened for its own person. Crisis signals are never exported.
 * Each section is `{ title, header, rows }`, which the account module writes after the
 * transactions; the words are Indonesian like the rest of the export.
 */

import { type CareRepository, careRepository } from './care.repository.ts';
import { exportKey, openPlan } from './care.safety-plan.service.ts';

export type ExportSection = { title: string; header: string[]; rows: string[][] };

type ExportDeps = { repository?: CareRepository; key?: () => Promise<CryptoKey> };

/** The sections with something in them, in a fixed order. */
export async function careExportSections(userId: string, deps: ExportDeps = {}): Promise<ExportSection[]> {
  const repository = deps.repository ?? careRepository;
  const [checkIns, activatedAt, plan] = await Promise.all([
    repository.listCheckIns(userId),
    repository.findDebtEmergency(userId),
    repository.findSafetyPlan(userId),
  ]);
  const sections: ExportSection[] = [];
  if (checkIns.length > 0) {
    sections.push({
      title: 'Check-in Kira Peduli',
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
    sections.push({ title: 'Mode Darurat Utang', header: ['aktif_sejak'], rows: [[activatedAt.toISOString()]] });
  }
  if (plan) {
    const opened = await openPlan(plan, await (deps.key ?? exportKey)());
    sections.push({
      title: 'Rencana Keselamatanku',
      header: ['bagian', 'isi'],
      rows: [
        ['tanda_peringatan', opened.warningSigns],
        ['yang_menenangkan', opened.calmingThings],
        ...opened.people.map((person) => ['orang_terdekat', `${person.name} ${person.phone}`.trim()]),
        ...opened.professionals.map((person) => ['tenaga_profesional', `${person.name} ${person.phone}`.trim()]),
        ['tempat_aman', opened.safePlace],
        ['diperbarui', opened.updatedAt],
      ],
    });
  }
  return sections;
}
