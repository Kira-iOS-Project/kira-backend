/**
 * Tangga Keuanganmu and the calculators' prefill (kira-project-41 builds them): the four steps from
 * the Kira Score engine's indicators, and the figures Tujuan Baru and Kalkulator Dana Darurat start
 * from. Until then every step is ahead and every figure unknown.
 */

import { LADDER_STATUS, PLAN_LADDER_STEP } from '../../lib/constants/plan.ts';
import type { LadderStep, PlanPrefill } from './plan.schema.ts';

const NO_DETAIL: LadderStep['detail'] = {
  debtName: null,
  amount: null,
  target: null,
  multiple: null,
  targetMultiple: null,
  health: null,
  incomeCover: null,
};

export async function ladderOf(_userId: string): Promise<LadderStep[]> {
  return Object.values(PLAN_LADDER_STEP).map((key, index) => ({
    step: index + 1,
    key,
    status: LADDER_STATUS.todo,
    detail: NO_DETAIL,
  }));
}

export async function prefillOf(_userId: string): Promise<PlanPrefill> {
  return {
    essentialExpense: null,
    emergencyFund: null,
    married: null,
    dependants: null,
    monthlyIncome: null,
  };
}
