import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../lib/constants/profile.ts';
import { amountSchema } from '../../lib/money/money.schema.ts';
import { FINANCE_INPUT_ALIAS, WALLET_TYPE } from '../../lib/constants/ung.ts';

const walletSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: z.enum(enumValues(WALLET_TYPE)),
    balance: z.number().int().min(0),
    createdAt: z.iso.datetime(),
  })
  .openapi('Wallet');

const date = z.iso.date();

const debtSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(enumValues(DEBT_KIND)),
    originalAmount: z.number().int().min(0),
    remainingAmount: z.number().int().min(0),
    monthlyInstallment: z.number().int().min(0),
    remainingTenorMonths: z.number().int().nullable(),
    installmentsTotal: z.number().int().nullable(),
    installmentsRemaining: z.number().int().nullable(),
    paymentStatus: z.enum(enumValues(DEBT_PAYMENT_STATUS)),
    nextInstallment: z
      .object({ dueDate: date, amount: z.number().int(), status: z.enum(['upcoming', 'dueSoon']) })
      .nullable(),
    dueSoon: z.boolean(),
  })
  .openapi('DebtSummary');

export const walletCreateResponseSchema = z.union([walletSchema, debtSummarySchema]);
export const debtCreateResponseSchema = debtSummarySchema;

export const walletListSchema = z
  .object({
    items: z.array(walletSchema),
    debts: z.array(debtSummarySchema),
    heldTotal: z.number().int().min(0),
    totalDebt: z.number().int().min(0),
  })
  .openapi('WalletList');

const name = z.string().trim().min(1).max(60);
const optionalBalance = {
  balance: z.number().int().min(0).max(10_000_000_000_000).optional(),
  openingBalance: z.number().int().min(0).max(10_000_000_000_000).optional(),
};
const createWalletInputSchema = z
  .object({
    name,
    type: z.enum([
      WALLET_TYPE.cash,
      WALLET_TYPE.bank,
      FINANCE_INPUT_ALIAS.eWallet,
      WALLET_TYPE.eWallet,
      WALLET_TYPE.other,
    ]),
    ...optionalBalance,
  })
  .refine(({ balance, openingBalance }) => balance !== undefined || openingBalance !== undefined, {
    path: ['balance'],
    message: 'A wallet balance is required.',
  })
  .refine(
    ({ balance, openingBalance }) =>
      balance === undefined || openingBalance === undefined || balance === openingBalance,
    { path: ['balance'], message: 'balance and openingBalance must match when both are sent.' },
  );
const createDebtWalletInputSchema = z.object({
  name,
  type: z.enum([DEBT_KIND.creditCard, DEBT_KIND.paylater, FINANCE_INPUT_ALIAS.pinjol]),
  remainingDebt: amountSchema,
  monthlyInstallment: z.number().int().min(0).max(10_000_000_000_000).optional(),
  remainingTenorMonths: z.number().int().min(0).max(600).nullable().optional(),
  nextDueDate: date.optional(),
});

export const createWalletBodySchema = z
  .union([createWalletInputSchema, createDebtWalletInputSchema])
  .openapi('CreateWalletInput');

export const createDebtBodySchema = z
  .object({
    name,
    kind: z.enum([
      DEBT_KIND.creditCard,
      DEBT_KIND.paylater,
      FINANCE_INPUT_ALIAS.pinjol,
      DEBT_KIND.onlineLoan,
    ]),
    amount: amountSchema,
    monthlyInstallment: z.number().int().min(0).max(10_000_000_000_000).optional(),
    remainingTenorMonths: z.number().int().min(0).max(600).nullable().optional(),
    nextDueDate: date.optional(),
  })
  .openapi('CreateDebtInput');

export type CreateWalletInput = z.infer<typeof createWalletBodySchema>;
export type CreateDebtInput = z.infer<typeof createDebtBodySchema>;
