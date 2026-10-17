/**
 * The figure each indicator measured, in the short form Riwayat Kira Score's "Yang Berubah Bulan
 * Ini" rows put on either side of the arrow ("0,8× → 1,1× pengeluaran pokok", "25 → 50 poin"). A
 * snapshot keeps these so a past month reads as it measured then; the app adds the words around
 * them.
 */

import { INDICATOR } from '../../lib/constants/score.ts';
import type { IndicatorLabels } from '../../db/schema/schema.ts';
import type { Evaluation } from './score.measure.ts';

/** One decimal with a comma, as Indonesian writes it: 1.1 → "1,1". */
function decimal(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

/** The labels of one evaluation, keyed by indicator. */
export function labelsOf(evaluation: Evaluation): IndicatorLabels {
  const labels = {} as IndicatorLabels;
  for (const { key, measure } of evaluation.indicators) {
    labels[key] = labelOf(key, measure);
  }
  return labels;
}

function labelOf(
  key: Evaluation['indicators'][number]['key'],
  measure: Evaluation['indicators'][number]['measure'],
): string {
  switch (key) {
    case INDICATOR.emergencyFund:
      return 'ratio' in measure ? `${decimal(measure.ratio)}×` : '';
    case INDICATOR.consumerDebt:
      return 'platforms' in measure ? `${measure.platforms} platform` : '';
    case INDICATOR.protection:
      return 'health' in measure ? `${Number(measure.health) + Number(measure.income)} dari 2` : '';
    default:
      return 'percent' in measure ? `${measure.percent}%` : '';
  }
}
