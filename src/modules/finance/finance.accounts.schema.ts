import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../lib/constants/profile.ts';
import { WALLET_TYPE } from '../../lib/constants/ung.ts';

export const walletSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: z.enum(enumValues(WALLET_TYPE)),
    balance: z.number().int().min(0),
    createdAt: z.iso.datetime(),
  })
  .openapi('Wallet');

const date = z.iso.date();

export const debtSummarySchema = z
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

export const walletListSchema = z
  .object({
    items: z.array(walletSchema),
    debts: z.array(debtSummarySchema),
    heldTotal: z.number().int().min(0),
    totalDebt: z.number().int().min(0),
  })
  .openapi('WalletList');
