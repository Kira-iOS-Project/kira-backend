/**
 * Kira Peduli's crisis contacts (PED-01, PED-03, PED-07), re-verified by the team every month: a
 * new check is a change of `CARE_CONTACTS_VERIFIED_ON` and of the rows below, released like code.
 * The app ships the same rows as its offline fallback. Layanan Kira Peduli's own line comes from
 * the environment and is left out until it is set: the boards name no number, and Kira never ships
 * a placeholder.
 */

import { CARE_CONTACT_KEY } from '../../lib/constants/care.ts';
import type { CareContact, CareContacts } from './care.schema.ts';

/** Layanan Kira Peduli's configured line; either part unset leaves the contact out. */
export type KiraCareLine = { phone: string | undefined; whatsapp: string | undefined };

export const CARE_CONTACTS_VERIFIED_ON = '2026-10-01';

/** The contacts that do not depend on the environment, in Kira Peduli's order, Kira's slot empty. */
export const PUBLIC_CARE_CONTACTS: readonly CareContact[] = [
  {
    key: CARE_CONTACT_KEY.healing119,
    name: 'Healing119',
    phone: '119',
    extension: '8',
    whatsapp: null,
    url: 'https://healing119.id',
    note: 'Free mental-health counselling by health workers.',
  },
  {
    key: CARE_CONTACT_KEY.psc119,
    name: 'PSC 119',
    phone: '119',
    extension: null,
    whatsapp: null,
    url: null,
    note: 'Public safety centre for medical emergencies, in every regency and city.',
  },
  {
    key: CARE_CONTACT_KEY.ojk157,
    name: 'OJK 157',
    phone: '157',
    extension: null,
    whatsapp: '081157157157',
    url: null,
    note: 'The financial services authority: complaints about lenders and collection.',
  },
  {
    key: CARE_CONTACT_KEY.satgasPasti,
    name: 'Satgas PASTI',
    phone: null,
    extension: null,
    whatsapp: null,
    url: 'https://sipasti.ojk.go.id',
    note: 'Reports of illegal lending and investment.',
  },
  {
    key: CARE_CONTACT_KEY.iasc,
    name: 'IASC',
    phone: null,
    extension: null,
    whatsapp: null,
    url: 'https://iasc.ojk.go.id',
    note: 'Anti-scam centre: blocks accounts used in a fraud.',
  },
  {
    key: CARE_CONTACT_KEY.lapsSjk,
    name: 'LAPS SJK',
    phone: null,
    extension: null,
    whatsapp: null,
    url: 'https://lapssjk.id',
    note: 'Dispute resolution when a complaint to the lender is not settled.',
  },
];

/** Layanan Kira Peduli, when its phone and WhatsApp are configured. */
export function kiraCareContact(line: KiraCareLine): CareContact | null {
  if (line.phone === undefined || line.whatsapp === undefined) return null;
  return {
    key: CARE_CONTACT_KEY.kiraCare,
    name: 'Layanan Kira Peduli',
    phone: line.phone,
    extension: null,
    whatsapp: line.whatsapp,
    url: null,
    note: 'The Kira Peduli team: the opening message is prepared, the person sends it.',
  };
}

/** The list GET /care/contacts answers: Healing119, Layanan Kira Peduli, then the rest. */
export function careContacts(line: KiraCareLine): CareContacts {
  const [healing, ...rest] = PUBLIC_CARE_CONTACTS;
  const kira = kiraCareContact(line);
  const contacts = [healing, ...(kira ? [kira] : []), ...rest].filter((contact) => contact !== undefined);
  return { verifiedOn: CARE_CONTACTS_VERIFIED_ON, contacts };
}
