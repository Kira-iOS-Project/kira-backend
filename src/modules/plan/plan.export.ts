/**
 * Rencana's part of the data export: the goals and the deposits marked against them, worded like
 * the rest of Unduh Datamu (Title Case Indonesian headers, WIB days, whole rupiah, the labels
 * people read instead of stored values). The risk profile's block is kira-project-41's.
 */

import { GOAL_KIND } from '../../lib/constants/plan.ts';
import type { ExportSection } from '../../lib/export/export-section.ts';
import { goalRepository, type GoalRepository } from './plan.goal.repository.ts';

/** Tujuan Baru's tile names. */
const GOAL_KIND_LABEL: Record<(typeof GOAL_KIND)[keyof typeof GOAL_KIND], string> = {
  [GOAL_KIND.emergencyFund]: 'Dana Darurat',
  [GOAL_KIND.houseDp]: 'DP Rumah',
  [GOAL_KIND.education]: 'Pendidikan Anak',
  [GOAL_KIND.wedding]: 'Menikah',
  [GOAL_KIND.retirement]: 'Dana Pensiun',
  [GOAL_KIND.vehicle]: 'Kendaraan',
  [GOAL_KIND.goods]: 'Barang Impian',
  [GOAL_KIND.other]: 'Lainnya',
};

/** The sections with something in them: the goals, then their deposits. */
export async function goalExportSections(
  userId: string,
  deps: { repository?: GoalRepository } = {},
): Promise<ExportSection[]> {
  const repository = deps.repository ?? goalRepository;
  const [goals, deposits] = await Promise.all([
    repository.listGoals(userId),
    repository.listAllDeposits(userId),
  ]);
  const sections: ExportSection[] = [];
  if (goals.length > 0) {
    sections.push({
      title: 'Rencana · Tujuan',
      header: [
        'Jenis',
        'Nama',
        'Target',
        'Tanggal Target',
        'Setoran Bulanan',
        'Tabungan Awal',
        'Terkumpul',
        'Pos Budget',
      ],
      rows: goals.map((goal) => [
        GOAL_KIND_LABEL[goal.kind],
        goal.name,
        String(goal.targetAmount),
        goal.targetDate,
        String(goal.monthlyDeposit),
        String(goal.initialAmount),
        String(goal.savedAmount),
        goal.inBudget ? 'Ya' : 'Tidak',
      ]),
    });
  }
  if (deposits.length > 0) {
    sections.push({
      title: 'Rencana · Setoran',
      header: ['Tujuan', 'Tanggal', 'Jumlah'],
      rows: deposits.map((deposit) => [
        deposit.goalName,
        deposit.depositedOn,
        String(deposit.amount),
      ]),
    });
  }
  return sections;
}
