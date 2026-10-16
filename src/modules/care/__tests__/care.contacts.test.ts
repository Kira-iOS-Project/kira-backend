import { describe, expect, test } from 'bun:test';
import { CARE_CONTACT_KEY } from '../../../lib/constants/care.ts';
import { CARE_CONTACTS_VERIFIED_ON, careContacts, kiraCareContact } from '../care.contacts.ts';

describe('care contacts', () => {
  test('list Healing119, Layanan Kira Peduli, then the others, once Kira’s line is set', () => {
    const list = careContacts({ phone: '0211500000', whatsapp: '081100000000' });

    expect(list.verifiedOn).toBe(CARE_CONTACTS_VERIFIED_ON);
    expect(list.contacts.map((contact) => contact.key)).toEqual([
      CARE_CONTACT_KEY.healing119,
      CARE_CONTACT_KEY.kiraCare,
      CARE_CONTACT_KEY.psc119,
      CARE_CONTACT_KEY.ojk157,
      CARE_CONTACT_KEY.satgasPasti,
      CARE_CONTACT_KEY.iasc,
      CARE_CONTACT_KEY.lapsSjk,
    ]);
    expect(list.contacts[0]).toMatchObject({ phone: '119', extension: '8' });
    expect(list.contacts[1]).toMatchObject({ phone: '0211500000', whatsapp: '081100000000' });
  });

  test('leave Layanan Kira Peduli out while either part of its line is unset', () => {
    expect(kiraCareContact({ phone: '0211500000', whatsapp: undefined })).toBeNull();
    expect(kiraCareContact({ phone: undefined, whatsapp: '081100000000' })).toBeNull();
    const keys = careContacts({ phone: undefined, whatsapp: undefined }).contacts.map((c) => c.key);
    expect(keys).not.toContain(CARE_CONTACT_KEY.kiraCare);
    expect(keys).toHaveLength(6);
  });
});
