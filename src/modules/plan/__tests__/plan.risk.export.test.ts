import { describe, expect, test } from 'bun:test';
import { RISK_PROFILE } from '../../../lib/constants/plan.ts';
import { riskExportSections } from '../plan.risk.export.ts';
import type { RiskRepository } from '../plan.risk.repository.ts';

const repositoryOf = (stored: Awaited<ReturnType<RiskRepository['find']>>): RiskRepository => ({
  find: async () => stored,
  save: async () => {
    throw new Error('not saved here');
  },
});

describe('riskExportSections', () => {
  test('one block with the profile, the answers counted from 1, and the WIB day', async () => {
    const at = new Date('2026-10-16T18:00:00.000Z');
    const stored = { answers: [1, 1, 1, 0, 1], profile: RISK_PROFILE.moderate, updatedAt: at };
    expect(await riskExportSections('user-1', { repository: repositoryOf(stored) })).toEqual([
      {
        title: 'Rencana · Profil Risiko',
        header: ['Profil Risiko', 'Jawaban', 'Tanggal'],
        rows: [['Moderat', '2, 2, 2, 1, 2', '2026-10-17']],
      },
    ]);
  });

  test('nothing before the quiz', async () => {
    expect(await riskExportSections('user-1', { repository: repositoryOf(null) })).toEqual([]);
  });
});
