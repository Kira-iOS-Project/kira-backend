import { z } from '@hono/zod-openapi';
import {
  COMMUNITY_CATEGORY,
  COMMUNITY_PLATFORM,
  COMMUNITY_PRODUCT_KIND,
  COMMUNITY_REPORT_REASON,
  COMMUNITY_REPORT_STORY_MAX,
  COMMUNITY_RULES_VERSION,
} from '../../lib/constants/community.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';

const categorySchema = z.enum(enumValues(COMMUNITY_CATEGORY));
const platformSchema = z.enum(enumValues(COMMUNITY_PLATFORM));
const kindSchema = z.enum(enumValues(COMMUNITY_PRODUCT_KIND));
const reasonSchema = z.enum(enumValues(COMMUNITY_REPORT_REASON));

export const groupIdParamsSchema = z.object({ id: z.uuid() });
export const productIdParamsSchema = z.object({ id: z.uuid() });

export const groupsQuerySchema = z.object({ category: categorySchema.optional() });
export const productsQuerySchema = z.object({ kind: kindSchema.optional() });

const groupSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    category: categorySchema,
    platform: platformSchema,
    memberCount: z.number().int(),
    summary: z.string(),
    /** The illustration Komunitas draws: paylater, saham, kripto, gaji, … */
    icon: z.string(),
    /** "edukasi saja": the group teaches and never recommends. */
    educationOnly: z.boolean(),
  })
  .openapi('CommunityGroupSummary');

export const groupsResponseSchema = z
  .object({
    categories: z.array(z.object({ key: categorySchema, label: z.string() })),
    groups: z.array(groupSummarySchema),
  })
  .openapi('CommunityGroups');

export const groupDetailSchema = groupSummarySchema
  .extend({
    about: z.string(),
    admin: z.object({
      name: z.string(),
      initials: z.string(),
      /** "Admin terverifikasi sejak Maret 2026": `2026-03`. */
      verifiedSince: z.string().regex(/^\d{4}-\d{2}$/),
    }),
    /** Aturan Utama. */
    rules: z.array(z.string()).length(3),
    linkCheckedOn: z.iso.date(),
    adminUnchanged: z.boolean(),
    /** The person accepted the current Aturan Komunitas Kira. */
    rulesAccepted: z.boolean(),
  })
  .openapi('CommunityGroup');

export const rulesConsentBodySchema = z
  .object({
    /** Only the current version is accepted; an older one is a 422. */
    version: z.literal(COMMUNITY_RULES_VERSION),
  })
  .openapi('CommunityRulesConsentRequest');

export const joinResponseSchema = z
  .object({ inviteUrl: z.url(), platform: platformSchema, linkCheckedOn: z.iso.date() })
  .openapi('CommunityGroupJoin');

export const reportBodySchema = z
  .object({
    reason: reasonSchema,
    /** Ceritakan singkat; required, not blank, when the reason is `other` (Lainnya). */
    story: z.string().max(COMMUNITY_REPORT_STORY_MAX).nullable().optional(),
  })
  .refine(
    (body) => body.reason !== COMMUNITY_REPORT_REASON.other || (body.story ?? '').trim() !== '',
    { message: 'A report for another reason needs its story.', path: ['story'] },
  )
  .openapi('CommunityReportRequest');

export const reportResponseSchema = z.object({ id: z.uuid() }).openapi('CommunityReport');

const productSummarySchema = z
  .object({
    id: z.uuid(),
    kind: kindSchema,
    title: z.string(),
    sellerName: z.string(),
    sellerInitials: z.string(),
    /** "Perencana Bersertifikat", "Terverifikasi", … */
    sellerBadge: z.string(),
    /** Whole rupiah; null is Gratis. */
    price: z.number().int().nullable(),
    /** The illustration Etalase draws: buku, kartu-lunas, celengan, komunitas, … */
    icon: z.string(),
  })
  .openapi('CommunityProductSummary');

export const productsResponseSchema = z
  .object({ products: z.array(productSummarySchema) })
  .openapi('CommunityProducts');

export const productDetailSchema = productSummarySchema
  .extend({
    description: z.string(),
    /** "6 modul video", "1 sesi · 45 menit", "PDF · 62 halaman", "14 November 2026 · daring". */
    meta: z.string(),
    sellerRole: z.string(),
    contentsTitle: z.string(),
    contents: z.array(z.string()),
    /** Kira receives a commission (the disclosure shows). */
    affiliate: z.boolean(),
    /** An investment product: the extra risk warning shows. */
    investmentRisk: z.boolean(),
    /** Null while the team checks the seller's page: Buka Halaman Penjual is off. */
    sellerUrl: z.url().nullable(),
  })
  .openapi('CommunityProduct');

export type GroupsQuery = z.infer<typeof groupsQuerySchema>;
export type ProductsQuery = z.infer<typeof productsQuerySchema>;
export type GroupSummary = z.infer<typeof groupSummarySchema>;
export type GroupsResponse = z.infer<typeof groupsResponseSchema>;
export type GroupDetail = z.infer<typeof groupDetailSchema>;
export type JoinResponse = z.infer<typeof joinResponseSchema>;
export type ReportBody = z.infer<typeof reportBodySchema>;
export type ProductSummary = z.infer<typeof productSummarySchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Platform = z.infer<typeof platformSchema>;
export type ProductKind = z.infer<typeof kindSchema>;
export type ReportReason = z.infer<typeof reasonSchema>;
