/**
 * The shapes of Rencana (Flow 6): the plan screen (REN-01) with Tangga Keuanganmu, the goals and
 * the calculators' prefill; a goal with its deposits and, for the emergency fund, its milestones
 * (REN-02 to REN-05); and Kenali Profil Risikomu (REN-06, REN-07). Amounts are whole rupiah; the
 * app writes every sentence around the numbers.
 */

import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import {
  EMERGENCY_MILESTONE,
  GOAL_AMOUNT_MAX,
  GOAL_KIND,
  GOAL_NAME_MAX,
  LADDER_STATUS,
  PLAN_LADDER_STEP,
  RISK_OPTION_COUNT,
  RISK_PROFILE,
  RISK_QUESTION_COUNT,
} from '../../lib/constants/plan.ts';
import { wibDate } from '../../lib/time/wib.ts';

/** The emergency fund's inputs name its monthly essential spending (Pengeluaran Pokok) by this key. */
export const ESSENTIAL_EXPENSE_INPUT = 'essentialExpense';

const amount = z.number().int().min(0).max(GOAL_AMOUNT_MAX);
const positiveAmount = z.number().int().min(1).max(GOAL_AMOUNT_MAX);
const goalKindSchema = z.enum(enumValues(GOAL_KIND));
const riskProfileKindSchema = z.enum(enumValues(RISK_PROFILE));
const day = z.iso.date().openapi({ example: '2029-04-25' });
/** A WIB day, never after today. */
const pastDay = z.iso
  .date()
  .refine((value) => value <= wibDate(new Date()), { message: 'The date cannot be in the future' });
/** A WIB day after today. */
const futureDay = z.iso
  .date()
  .refine((value) => value > wibDate(new Date()), { message: 'The date must be in the future' });

/** One step of Tangga Keuanganmu, with the figures the app words it from. */
const ladderStepSchema = z
  .object({
    step: z.number().int().min(1).max(4),
    key: z.enum(enumValues(PLAN_LADDER_STEP)),
    status: z.enum(enumValues(LADDER_STATUS)),
    /** Every field is null where the step has no such figure. */
    detail: z.object({
      /** Step 1: the account being paid off ("Sedang Berjalan · Paylater A"). */
      debtName: z.string().nullable(),
      /** Step 1: consumer debt left; step 2: the emergency fund now. */
      amount: z.number().int().nullable(),
      /** Step 2: the target, its multiple of essential spending. */
      target: z.number().int().nullable(),
      /** Step 2: the fund over essential spending, one decimal ("Sekarang 1,1×"). */
      multiple: z.number().nullable(),
      /** Step 2: 6 single, 9 married, +3 a dependant, 15 at most ("Dana Darurat 6×"). */
      targetMultiple: z.number().int().nullable(),
      /** Step 3: health cover held. */
      health: z.boolean().nullable(),
      /** Step 3: income cover held. */
      incomeCover: z.boolean().nullable(),
    }),
  })
  .openapi('LadderStep');

/** What the calculators start from, each null when it is not known. */
const planPrefillSchema = z
  .object({
    /** The last three months' recorded essential spending, averaged; else the health check's. */
    essentialExpense: z.number().int().nullable(),
    /** The health check's emergency fund. */
    emergencyFund: z.number().int().nullable(),
    married: z.boolean().nullable(),
    dependants: z.number().int().nullable(),
    /** The health check's net monthly income (Kenali Profil Risikomu's fifth question). */
    monthlyIncome: z.number().int().nullable(),
  })
  .openapi('PlanPrefill');

export const goalSummarySchema = z
  .object({
    id: z.uuid(),
    kind: goalKindSchema,
    name: z.string(),
    targetAmount: z.number().int(),
    targetDate: day,
    monthlyDeposit: z.number().int(),
    /** What was saved when the goal was made, plus every deposit. */
    savedAmount: z.number().int(),
  })
  .openapi('GoalSummary');

export const planSchema = z
  .object({
    ladder: z.array(ladderStepSchema).length(4),
    goals: z.array(goalSummarySchema),
    /** Null until Kenali Profil Risikomu is answered. */
    riskProfile: riskProfileKindSchema.nullable(),
    prefill: planPrefillSchema,
  })
  .openapi('PlanOverview');

/**
 * A calculator's inputs by name, as the app keeps them: amounts, rates, years, choices. An unknown
 * input is left out rather than sent as null (a null member breaks the iOS client's generator).
 */
const goalInputsSchema = z
  .record(
    z.string().min(1).max(40),
    z.union([z.number().min(0).max(GOAL_AMOUNT_MAX), z.string().max(80), z.boolean()]),
  )
  .refine((inputs) => Object.keys(inputs).length <= 30, { message: 'At most 30 inputs' })
  .openapi('GoalInputs');

export const goalSchema = goalSummarySchema
  .extend({
    inputs: goalInputsSchema,
    initialAmount: z.number().int(),
    /** "Jadikan Pos Budget" was chosen. */
    inBudget: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Goal');

export const goalDetailSchema = goalSchema
  .extend({
    /** Newest first. */
    deposits: z.array(z.object({ id: z.uuid(), amount: z.number().int(), depositedOn: day })),
    /** The emergency fund's 1 minggu, 1 bulan, 3× and target; empty for any other goal. */
    milestones: z.array(
      z.object({
        key: z.enum(enumValues(EMERGENCY_MILESTONE)),
        amount: z.number().int(),
        /** The day the saved amount first reached it; null while it has not. */
        reachedOn: day.nullable(),
      }),
    ),
  })
  .openapi('GoalDetail');

/** A goal's fields as Tujuan Baru sends them; the emergency fund also names its essential spending. */
const goalFieldsSchema = z.object({
  kind: goalKindSchema,
  name: z.string().trim().min(1).max(GOAL_NAME_MAX),
  inputs: goalInputsSchema,
  /** "Tabungan saat ini": what was already saved when the goal was made. */
  initialAmount: amount,
  monthlyDeposit: amount,
  targetAmount: positiveAmount,
  targetDate: futureDay,
  inBudget: z.boolean().default(false),
});

export const createGoalBodySchema = goalFieldsSchema
  .refine(
    (body) => {
      const essential = body.inputs[ESSENTIAL_EXPENSE_INPUT];
      return (
        body.kind !== GOAL_KIND.emergencyFund ||
        (typeof essential === 'number' && Number.isInteger(essential) && essential > 0)
      );
    },
    {
      message: `An emergency fund needs inputs.${ESSENTIAL_EXPENSE_INPUT}, its monthly essential spending`,
      path: ['inputs', ESSENTIAL_EXPENSE_INPUT],
    },
  )
  .openapi('CreateGoal');

/** Any of the goal's figures; its kind never changes. */
export const updateGoalBodySchema = goalFieldsSchema
  .omit({ kind: true, inBudget: true })
  .extend({ inBudget: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Change at least one field' })
  .openapi('UpdateGoal');

export const goalDepositBodySchema = z
  .object({
    /** The app's id for this deposit: a retry with it stores nothing twice. */
    depositId: z.uuid(),
    amount: positiveAmount,
    depositedOn: pastDay,
  })
  .openapi('GoalDepositInput');

export const goalDepositSchema = z
  .object({ id: z.uuid(), amount: z.number().int(), depositedOn: day })
  .openapi('GoalDeposit');

export const goalIdParamSchema = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

/** Kenali Profil Risikomu's answers: the 0-based option of each of the five questions. */
export const riskProfileBodySchema = z
  .object({
    answers: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(RISK_OPTION_COUNT - 1),
      )
      .length(RISK_QUESTION_COUNT),
  })
  .openapi('RiskProfileAnswers');

/** The profile and the answers it came from; every field null before the quiz. */
export const riskProfileSchema = z
  .object({
    profile: riskProfileKindSchema.nullable(),
    answers: z.array(z.number().int()).nullable(),
    updatedAt: z.iso.datetime().nullable(),
  })
  .openapi('RiskProfile');

export type Plan = z.infer<typeof planSchema>;
export type LadderStep = z.infer<typeof ladderStepSchema>;
export type PlanPrefill = z.infer<typeof planPrefillSchema>;
export type GoalSummary = z.infer<typeof goalSummarySchema>;
export type Goal = z.infer<typeof goalSchema>;
export type GoalDetail = z.infer<typeof goalDetailSchema>;
export type CreateGoalBody = z.infer<typeof createGoalBodySchema>;
export type UpdateGoalBody = z.infer<typeof updateGoalBodySchema>;
export type GoalDepositBody = z.infer<typeof goalDepositBodySchema>;
export type GoalDeposit = z.infer<typeof goalDepositSchema>;
export type RiskProfileView = z.infer<typeof riskProfileSchema>;
