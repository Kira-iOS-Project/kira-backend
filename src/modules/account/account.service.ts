/**
 * The account (AKN-01, AKN-04, AKN-05, ONB-08, ONB-09): who the person is and what their Profil
 * shows, the settings they change, the consents they give, their data export, and deleting it all.
 */

import { CONSENT_PURPOSE, PRIVACY_POLICY_VERSION } from '../../lib/constants/consents.ts';
import { EXPENSE_CATEGORY, INCOME_CATEGORY, TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import { type EmailMessage, sendEmail } from '../../lib/email/resend.ts';
import type { ExportScope, ExportSection } from '../../lib/export/export-section.ts';
import { logger } from '../../lib/server/logger.ts';
import { paydayPeriod, wibDate } from '../../lib/time/wib.ts';
import { activePlanOf, quotaPeriod, usageOf } from '../../lib/usage/plan-usage.ts';
import { assetExportSections } from '../asset/index.ts';
import { careExportSections } from '../care/index.ts';
import { communityExportSections } from '../community/index.ts';
import { budgetExportSections } from '../finance/index.ts';
import { goalExportSections, riskExportSections } from '../plan/index.ts';
import { scoreExportSections } from '../score/index.ts';
import { exportFileName, sectionsCsv, transactionsCsv } from './account.csv.ts';
import { accountDeletedEmail, dataExportEmail } from './account.email.ts';
import { type ExportEmailClaims, exportEmailClaims } from './account-export.repository.ts';
import { ExportEmailFailedError, ExportEmailRateLimitedError } from './account.errors.ts';
import {
  type AccountRepository,
  accountRepository,
  type ConsentDecision,
  type Profile,
} from './account.repository.ts';
import type { Consents, ConsentsUpdate, Me, MeUpdate } from './account.schema.ts';
import { UnauthenticatedError } from '../auth/index.ts';

type AccountDeps = {
  repository?: AccountRepository;
  send?: (message: EmailMessage) => Promise<void>;
  now?: () => Date;
  exportSections?: (userId: string, scope: ExportScope) => Promise<ExportSection[]>;
  exportClaims?: ExportEmailClaims;
};

/** One emailed export every ten minutes. */
export const EXPORT_EMAIL_COOLDOWN_MS = 10 * 60_000;

/** Every other module's blocks of Unduh Datamu, after the transactions in this order. */
async function moduleExportSections(userId: string, scope: ExportScope): Promise<ExportSection[]> {
  return (
    await Promise.all([
      scoreExportSections(userId),
      communityExportSections(userId),
      careExportSections(userId, scope),
      assetExportSections(userId),
      goalExportSections(userId),
      riskExportSections(userId),
      budgetExportSections(userId),
    ])
  ).flat();
}

/** The download carries the safety plan; the emailed copy never does (ExportScope). */
const DOWNLOAD_SCOPE: ExportScope = { safetyPlan: true };
const EMAIL_SCOPE: ExportScope = { safetyPlan: false };

function resolve(deps: AccountDeps) {
  return {
    repository: deps.repository ?? accountRepository,
    send: deps.send ?? sendEmail,
    now: deps.now?.() ?? new Date(),
    exportSections: deps.exportSections ?? moduleExportSections,
  };
}

/** A signed-in session always has its account: the row and its sessions go together (cascade). */
async function profileOf(repository: AccountRepository, userId: string): Promise<Profile> {
  const profile = await repository.findProfile(userId);
  /** The account was deleted while this request was in flight: its session is gone too. */
  if (!profile) throw new UnauthenticatedError('account deleted');
  return profile;
}

function grantedOf(decisions: ConsentDecision[], purpose: ConsentDecision['purpose']): boolean {
  return decisions.find((decision) => decision.purpose === purpose)?.granted ?? false;
}

/** The value as a word of the vocabulary, or null: narrows a category read by its type filter. */
function wordOf<T extends string>(vocabulary: Record<string, T>, value: string | null): T | null {
  return Object.values(vocabulary).find((word) => word === value) ?? null;
}

/** GET /me: everything Profil and the app's first screens need, in one answer. */
export async function getMe(userId: string, deps: AccountDeps = {}): Promise<Me> {
  const { repository, now } = resolve(deps);
  const today = wibDate(now);
  const [profile, subscriptions, decisions, healthCheck, expense, income, debts] =
    await Promise.all([
      profileOf(repository, userId),
      repository.findActiveSubscriptions(userId),
      repository.latestConsents(userId),
      repository.hasHealthCheck(userId),
      repository.lastCategory(userId, TRANSACTION_TYPE.expense),
      repository.lastCategory(userId, TRANSACTION_TYPE.income),
      repository.countOpenDebts(userId),
    ]);
  const plan = activePlanOf(subscriptions);
  const quota = quotaPeriod(plan.subscription, today);
  const counters = await repository.findUsage(userId, quota.start);
  const payday = { day: profile.paydayDay, endOfMonth: profile.paydayEndOfMonth };
  return {
    id: userId,
    email: profile.email,
    displayName: profile.displayName,
    focus: profile.focus,
    payday,
    hideBalances: profile.hideBalances,
    consented: profile.consentedAt !== null,
    healthCheckCompleted: healthCheck,
    plan: { id: plan.id, source: plan.source, renewsOn: plan.renewsOn },
    usage: usageOf(counters, plan.id, quota.resetsOn),
    period: paydayPeriod(today, payday),
    lastCategories: {
      expense: wordOf(EXPENSE_CATEGORY, expense),
      income: wordOf(INCOME_CATEGORY, income),
    },
    debtAccountCount: debts,
    aiEnabled: grantedOf(decisions, CONSENT_PURPOSE.aiProcessing),
    weeklySummaryEnabled: grantedOf(decisions, CONSENT_PURPOSE.weeklySummary),
    debtEmergencyActive: profile.debtEmergencyModeUsedAt !== null,
  };
}

/** PATCH /me: the focus (ONB-09, Profil), Sembunyikan Saldo (AKN-03) and the payday. */
export async function updateMe(userId: string, changes: MeUpdate, deps: AccountDeps = {}) {
  const { repository } = resolve(deps);
  await repository.updateProfile(userId, {
    ...(changes.focus === undefined ? {} : { focus: changes.focus }),
    ...(changes.hideBalances === undefined ? {} : { hideBalances: changes.hideBalances }),
    ...(changes.payday === undefined
      ? {}
      : { paydayDay: changes.payday.day, paydayEndOfMonth: changes.payday.endOfMonth }),
  });
  return getMe(userId, deps);
}

/** GET /me/consents: the decision in force per purpose; the core purpose is always on. */
export async function getConsents(userId: string, deps: AccountDeps = {}): Promise<Consents> {
  const { repository } = resolve(deps);
  const decisions = await repository.latestConsents(userId);
  return {
    policyVersion: PRIVACY_POLICY_VERSION,
    items: Object.values(CONSENT_PURPOSE).map((purpose) => {
      const latest = decisions.find((decision) => decision.purpose === purpose);
      return {
        purpose,
        granted: purpose === CONSENT_PURPOSE.core || (latest?.granted ?? false),
        decidedAt: latest?.decidedAt.toISOString() ?? null,
      };
    }),
  };
}

/** PUT /me/consents: Persetujuan Data (ONB-08) and the toggles of Data & Privasi (AKN-04). */
export async function updateConsents(
  userId: string,
  input: ConsentsUpdate,
  deps: AccountDeps = {},
): Promise<Consents> {
  const { repository, now } = resolve(deps);
  await repository.recordConsents(
    userId,
    [
      { purpose: CONSENT_PURPOSE.aiProcessing, granted: input.aiProcessing },
      { purpose: CONSENT_PURPOSE.weeklySummary, granted: input.weeklySummary },
    ],
    now,
  );
  return getConsents(userId, deps);
}

async function buildExport(deps: ReturnType<typeof resolve>, userId: string, scope: ExportScope) {
  const [rows, sections] = await Promise.all([
    deps.repository.listExportRows(userId),
    deps.exportSections(userId, scope),
  ]);
  const csv = transactionsCsv(rows) + sectionsCsv(sections);
  return { fileName: exportFileName(deps.now), csv, rowCount: rows.length };
}

/** GET /me/export: Unduh Datamu, the CSV saved to the device (AKN-04c). */
export async function exportData(userId: string, deps: AccountDeps = {}) {
  const { fileName, csv } = await buildExport(resolve(deps), userId, DOWNLOAD_SCOPE);
  return { fileName, csv };
}

/**
 * POST /me/export/email: Unduh Datamu Dulu, the CSV sent to the account's address (AKN-05): the
 * download's, without the safety plan.
 */
export async function emailExport(userId: string, deps: AccountDeps = {}): Promise<void> {
  const resolved = resolve(deps);
  const { repository, send, now } = resolved;
  const claims = deps.exportClaims ?? exportEmailClaims;
  const since = new Date(now.getTime() - EXPORT_EMAIL_COOLDOWN_MS);
  if (!(await claims.claim(userId, now, since))) throw new ExportEmailRateLimitedError();
  const [profile, built] = await Promise.all([
    profileOf(repository, userId),
    buildExport(resolved, userId, EMAIL_SCOPE),
  ]);
  try {
    await send(dataExportEmail({ to: profile.email, name: profile.displayName, ...built }));
  } catch (err) {
    logger.error({ err }, 'Data export email failed');
    await claims.release(userId, now);
    throw new ExportEmailFailedError('data export');
  }
}

/**
 * POST /me/deletion: Hapus Permanen (AKN-05). The address is read first, the account is deleted,
 * and the notice goes out after the answer without being awaited: a slow email can no longer turn
 * a deletion that happened into a timeout the app reads as "Datamu masih utuh", and a failed one is
 * logged. Deleting an account that is already gone does nothing, so a retry (AKN-05c) is safe.
 */
export async function deleteAccount(userId: string, deps: AccountDeps = {}): Promise<void> {
  const { repository, send, now } = resolve(deps);
  const profile = await repository.findProfile(userId);
  await repository.deleteUser(userId);
  if (!profile) return;
  const notice = accountDeletedEmail({ to: profile.email, name: profile.displayName, now });
  void (async () => {
    try {
      await send(notice);
    } catch (err) {
      logger.error({ err }, 'Account deletion email failed after the deletion');
    }
  })();
}
