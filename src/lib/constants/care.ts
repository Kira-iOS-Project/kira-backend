/**
 * Kira Peduli (PED-01 to PED-10): the crisis contacts' keys, the level and source of a crisis
 * signal, a check-in's states and delays, and the index that keeps one check-in pending a person.
 */

/** The contacts of GET /care/contacts, in the order Kira Peduli lists them. */
export const CARE_CONTACT_KEY = {
  healing119: 'healing119',
  kiraCare: 'kira_care',
  psc119: 'psc119',
  ojk157: 'ojk157',
  satgasPasti: 'satgas_pasti',
  iasc: 'iasc',
  lapsSjk: 'laps_sjk',
} as const;

/** How serious the words the device read were (PED-02). */
export const CARE_SIGNAL_LEVEL = {
  concern: 'concern',
  danger: 'danger',
} as const;

/** Where the device read them: a Catat message or a reply to a check-in. */
export const CARE_SIGNAL_SOURCE = {
  chat: 'chat',
  checkIn: 'check_in',
} as const;

/** A check-in (PED-05, PED-06): waiting for its time, shown in Catat, or called off. */
export const CHECK_IN_STATUS = {
  pending: 'pending',
  seen: 'seen',
  cancelled: 'cancelled',
} as const;

/** Besok, Lusa, Tiga Hari Lagi. */
export const CHECK_IN_DELAY_HOURS = [24, 48, 72] as const;

/** The partial unique index that allows one pending check-in a person. */
export const ONE_PENDING_CHECK_IN_INDEX = 'care_check_ins_one_pending_idx';
