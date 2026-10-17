/**
 * Kira Peduli's rules (PED-01 to PED-09): the contact list, a crisis signal with no words in it,
 * one check-in at a time shown in Catat when its time comes (no notifications), Mode Darurat Utang
 * turned on once, and the debts the negotiation script names.
 */

import { env } from '../../env.ts';
import { careContacts, type KiraCareLine } from './care.contacts.ts';
import { CareCheckInNotFoundError } from './care.errors.ts';
import { type CareRepository, careRepository } from './care.repository.ts';
import type { CareContacts, CareSignalBody, CheckIn, Debt } from './care.schema.ts';

const HOUR_MS = 3_600_000;

export type CareDeps = {
  repository?: CareRepository;
  now?: () => Date;
  kiraLine?: KiraCareLine;
};

function resolve(deps: CareDeps) {
  return { repository: deps.repository ?? careRepository, now: deps.now?.() ?? new Date() };
}

function toCheckIn(row: { id: string; dueAt: Date }): CheckIn {
  return { id: row.id, dueAt: row.dueAt.toISOString() };
}

/** The crisis contacts, with Layanan Kira Peduli once its line is configured. */
export function listContacts(deps: CareDeps = {}): CareContacts {
  return careContacts(
    deps.kiraLine ?? { phone: env.KIRA_CARE_PHONE, whatsapp: env.KIRA_CARE_WHATSAPP },
  );
}

/** Stores that a signal happened: its level, source and time, never the words. */
export async function recordSignal(userId: string, signal: CareSignalBody, deps: CareDeps = {}) {
  await resolve(deps).repository.recordSignal(userId, signal);
}

/** Besok, Lusa or Tiga Hari Lagi: replaces any check-in still waiting. */
export async function scheduleCheckIn(
  userId: string,
  afterHours: number,
  deps: CareDeps = {},
): Promise<CheckIn> {
  const { repository, now } = resolve(deps);
  return toCheckIn(
    await repository.scheduleCheckIn(userId, new Date(now.getTime() + afterHours * HOUR_MS)),
  );
}

export async function cancelCheckIn(userId: string, id: string, deps: CareDeps = {}) {
  if (!(await resolve(deps).repository.cancelCheckIn(userId, id)))
    throw new CareCheckInNotFoundError();
}

/** The check-in to show when the app opens, or null. */
export async function dueCheckIn(
  userId: string,
  deps: CareDeps = {},
): Promise<{ checkIn: CheckIn | null }> {
  const { repository, now } = resolve(deps);
  const row = await repository.findDueCheckIn(userId, now);
  return { checkIn: row ? toCheckIn(row) : null };
}

export async function markCheckInSeen(userId: string, id: string, deps: CareDeps = {}) {
  const { repository, now } = resolve(deps);
  if (!(await repository.markCheckInSeen(userId, id, now))) throw new CareCheckInNotFoundError();
}

/** Opening Mode Darurat Utang turns it on, and keeps the first time (Beasiswa Kira reads it). */
export async function activateDebtEmergency(userId: string, deps: CareDeps = {}) {
  const { repository, now } = resolve(deps);
  const activatedAt = (await repository.activateDebtEmergency(userId, now)) ?? now;
  return { activatedAt: activatedAt.toISOString() };
}

/** The health check's debts still open, for the negotiation script's lender list. */
export async function listDebts(userId: string, deps: CareDeps = {}): Promise<{ debts: Debt[] }> {
  return { debts: await resolve(deps).repository.listDebts(userId) };
}
