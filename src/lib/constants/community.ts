/**
 * Terhubung (KOM-01 to KOM-08): the community groups and Etalase products the Kira team curates,
 * the community rules a person accepts before joining, and the reports that take a group down.
 */

/** The chips of Komunitas, in their order. */
export const COMMUNITY_CATEGORY = {
  debtFree: 'debt_free',
  stocks: 'stocks',
  crypto: 'crypto',
  financeTalk: 'finance_talk',
} as const;

/** Where a group meets; the invite opens that app. */
export const COMMUNITY_PLATFORM = {
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  discord: 'discord',
} as const;

/** A curated group or product: `active` is listed; `suspended` is hidden until the team reviews it. */
export const COMMUNITY_LISTING_STATUS = {
  active: 'active',
  suspended: 'suspended',
} as const;

/** Apa yang Kamu Temukan? (KOM-05). */
export const COMMUNITY_REPORT_REASON = {
  defaultInvite: 'default_invite',
  guaranteedProfit: 'guaranteed_profit',
  scam: 'scam',
  dataOrJockey: 'data_or_jockey',
  inappropriate: 'inappropriate',
  other: 'other',
} as const;

/** A report waits for the moderation team (`open`) until it is `reviewed`. */
export const COMMUNITY_REPORT_STATUS = {
  open: 'open',
  reviewed: 'reviewed',
} as const;

/** The partial unique index that allows one open report a person per group. */
export const OPEN_REPORT_INDEX = 'community_reports_one_open_idx';

/** The kinds of Etalase, its chips in order. */
export const COMMUNITY_PRODUCT_KIND = {
  course: 'course',
  consultation: 'consultation',
  ebook: 'ebook',
  event: 'event',
} as const;

/**
 * The version of Aturan Komunitas Kira (KOM-03) a person accepts; a new version asks again on the
 * next Gabung Grup.
 */
export const COMMUNITY_RULES_VERSION = 'community-2026-10-01';

/** A group with reports from this many different people within the window is taken down. */
export const COMMUNITY_SUSPENSION_REPORTERS = 5;
export const COMMUNITY_SUSPENSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The story of a report, at most (Ceritakan singkat). */
export const COMMUNITY_REPORT_STORY_MAX = 500;

/** The curated lists are short; a list never reads past this many rows (AGENTS.md Rule 29). */
export const COMMUNITY_LIST_LIMIT = 100;

/** The advisory-lock key the boot-time catalog sync holds, so two instances never interleave. */
export const COMMUNITY_CATALOG_LOCK = 'community:catalog';
