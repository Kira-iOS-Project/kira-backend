/**
 * What a person agrees their data may be used for (ONB-08, AKN-04). Each decision is stored with
 * the privacy-policy version it was made under, which is the UU PDP audit trail; the core purpose
 * cannot be turned off.
 */

export const CONSENT_PURPOSE = {
  core: 'core',
  aiProcessing: 'ai_processing',
  weeklySummary: 'weekly_summary',
} as const;

/** The privacy policy in force (AKN-08c "Berlaku sejak 15 Oktober 2026"). */
export const PRIVACY_POLICY_VERSION = 'privacy-2026-10-15';
