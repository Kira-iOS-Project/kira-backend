/**
 * Kira Peduli's part of the data export: the check-ins, when Mode Darurat Utang was turned on,
 * and, in the download only (`ExportScope`), the safety plan opened for its own person. Crisis
 * signals are never exported.
 * Each section is `{ title, header, rows }`, which the account module writes after the
 * transactions, worded like them: Title Case Indonesian headers, WIB dates and clock times, and
 * the labels people read instead of stored values.
 */

import { CHECK_IN_STATUS_LABEL } from '../../lib/constants/care.ts';
import type { ExportScope, ExportSection } from '../../lib/export/export-section.ts';
import { wibDate, wibTime } from '../../lib/time/wib.ts';
import { type CareRepository, careRepository } from './care.repository.ts';
import { exportKey, readablePlan } from './care.safety-plan.service.ts';

type ExportDeps = { repository?: CareRepository; key?: () => Promise<CryptoKey> };

/** An instant as the export's two columns, Tanggal and Jam; none is two empty cells. */
function dateAndTime(instant: Date | null): [string, string] {
  return instant ? [wibDate(instant), wibTime(instant)] : ['', ''];
}

/** A person of the plan as one cell: the name, then the number. */
function contact(person: { name: string; phone: string }): string {
  return `${person.name} ${person.phone}`.trim();
}

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
      header: [
        'Tanggal',
        'Jam',
        'Tanggal Check-in',
        'Jam Check-in',
        'Status',
        'Tanggal Dilihat',
        'Jam Dilihat',
      ],
      rows: checkIns.map((row) => [
        ...dateAndTime(row.createdAt),
        ...dateAndTime(row.dueAt),
        CHECK_IN_STATUS_LABEL[row.status],
        ...dateAndTime(row.seenAt),
      ]),
    });
  }
  if (activatedAt) {
    sections.push({
      title: 'Kira Peduli · Mode Darurat Utang',
      header: ['Tanggal Aktif', 'Jam Aktif'],
      rows: [dateAndTime(activatedAt)],
    });
  }
  const opened = plan ? await readablePlan(plan, await (deps.key ?? exportKey)()) : null;
  if (plan && opened) {
    const [updatedOn, updatedAt] = dateAndTime(plan.updatedAt);
    sections.push({
      title: 'Kira Peduli · Rencana Keselamatanku',
      header: ['Bagian', 'Isi'],
      rows: [
        ['Tanda Peringatan', opened.warningSigns],
        ['Yang Menenangkan', opened.calmingThings],
        ...opened.people.map((person) => ['Orang Terdekat', contact(person)]),
        ...opened.professionals.map((person) => ['Tenaga Profesional', contact(person)]),
        ['Tempat Aman', opened.safePlace],
        ['Tanggal Diperbarui', updatedOn],
        ['Jam Diperbarui', updatedAt],
      ],
    });
  }
  return sections;
}
