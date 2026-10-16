import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import {
  BILLING_PERIOD,
  PAYMENT_METHOD,
  PLAN,
  SUBSCRIPTION_SOURCE,
} from '../../lib/constants/plans.ts';
import { usageSchema } from '../../lib/usage/usage.schema.ts';

const planSchema = z.enum(enumValues(PLAN));
const paidPlanSchema = z.enum([PLAN.young, PLAN.plus]);
const periodSchema = z.enum(enumValues(BILLING_PERIOD));
const paymentMethodSchema = z.enum(enumValues(PAYMENT_METHOD));

/** Traktir Kira sells one, three or six months of Kira Plus. */
export const GIFT_MONTHS = [1, 3, 6] as const;

export const plansResponseSchema = z
  .object({
    plans: z.array(
      z
        .object({
          id: planSchema,
          monthlyPrice: z.number().int(),
          yearlyPrice: z.number().int(),
          /** Twelve monthly payments minus the yearly price: "Hemat Rp30.000,00". */
          yearlySaving: z.number().int(),
          aiMessages: z.number().int(),
          receipts: z.number().int(),
          voiceSeconds: z.number().int(),
          voiceAndImport: z.boolean(),
        })
        .openapi('Plan'),
    ),
    current: z.object({ plan: planSchema, period: periodSchema.nullable() }),
  })
  .openapi('Plans');

export const checkoutBodySchema = z
  .object({ plan: paidPlanSchema, period: periodSchema, paymentMethod: paymentMethodSchema })
  .openapi('Checkout');

export const subscriptionSchema = z
  .object({
    id: z.uuid(),
    plan: planSchema,
    period: periodSchema,
    source: z.enum(enumValues(SUBSCRIPTION_SOURCE)),
    /** Whole rupiah a period; 0 for a Beasiswa Kira grant. */
    price: z.number().int(),
    paymentMethod: paymentMethodSchema.nullable(),
    currentPeriodStart: z.iso.datetime(),
    /** The renewal date, or the last day of a cancelled or granted plan. */
    renewsOn: z.iso.date(),
    /** The renewal reminder email goes out on this date, three days before. */
    reminderOn: z.iso.date(),
    cancelAtPeriodEnd: z.boolean(),
    usage: usageSchema,
  })
  .openapi('Subscription');

export const paymentMethodBodySchema = z
  .object({ paymentMethod: paymentMethodSchema })
  .openapi('PaymentMethodChange');

export const invoicesResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.uuid(),
          plan: planSchema,
          period: periodSchema,
          amount: z.number().int(),
          paymentMethod: paymentMethodSchema,
          periodStart: z.iso.date(),
          createdAt: z.iso.datetime(),
        })
        .openapi('Invoice'),
    ),
  })
  .openapi('Invoices');

export const giftBodySchema = z
  .object({
    months: z.literal(GIFT_MONTHS),
    paymentMethod: paymentMethodSchema,
  })
  .openapi('GiftRequest');

export const giftResponseSchema = z
  .object({ id: z.uuid(), months: z.number().int(), amount: z.number().int() })
  .openapi('Gift');

export type PlansResponse = z.infer<typeof plansResponseSchema>;
export type CheckoutBody = z.infer<typeof checkoutBodySchema>;
export type SubscriptionResponse = z.infer<typeof subscriptionSchema>;
export type InvoicesResponse = z.infer<typeof invoicesResponseSchema>;
export type GiftBody = z.infer<typeof giftBodySchema>;
export type GiftResponse = z.infer<typeof giftResponseSchema>;
export type BillingPeriod = z.infer<typeof periodSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PaidPlan = z.infer<typeof paidPlanSchema>;
