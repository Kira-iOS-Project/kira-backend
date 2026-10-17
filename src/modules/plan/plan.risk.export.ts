/**
 * Kenali Profil Risikomu's part of the data export: the profile, the five answers (the option picked,
 * counted from 1 as the quiz shows them) and when it was taken, worded like the other blocks.
 */

import { RISK_PROFILE } from '../../lib/constants/plan.ts';
import type { ExportSection } from '../../lib/export/export-section.ts';
import { wibDate } from '../../lib/time/wib.ts';
import { riskRepository, type RiskRepository } from './plan.risk.repository.ts';

/** HasilRisiko's three-step scale. */
const PROFILE_LABEL: Record<(typeof RISK_PROFILE)[keyof typeof RISK_PROFILE], string> = {
  [RISK_PROFILE.conservative]: 'Konservatif',
  [RISK_PROFILE.moderate]: 'Moderat',
  [RISK_PROFILE.aggressive]: 'Agresif',
};

/** The risk-profile block, or nothing before the quiz. */
export async function riskExportSections(
  userId: string,
  deps: { repository?: RiskRepository } = {},
): Promise<ExportSection[]> {
  const row = await (deps.repository ?? riskRepository).find(userId);
  if (!row) return [];
  return [
    {
      title: 'Rencana · Profil Risiko',
      header: ['Profil Risiko', 'Jawaban', 'Tanggal'],
      rows: [
        [
          PROFILE_LABEL[row.profile],
          row.answers.map((answer) => answer + 1).join(', '),
          wibDate(row.updatedAt),
        ],
      ],
    },
  ];
}
