import { describe, expect, test } from 'bun:test';
import {
  CHECKS_PER_EMAIL,
  CHECKS_PER_IP,
  checkRefusal,
  CODES_PER_EMAIL,
  CODES_PER_IP,
  codeRefusal,
  RESEND_COOLDOWN_MS,
} from '../auth.limits.ts';
import { NOW } from './helpers.ts';

const fresh = { latestAt: null, emailCount: 0, ipCount: 0 };

describe('codeRefusal', () => {
  test('allows a first code, and one a minute after the last', () => {
    expect(codeRefusal(fresh, NOW)).toBeNull();
    const latestAt = new Date(NOW.getTime() - RESEND_COOLDOWN_MS);
    expect(codeRefusal({ ...fresh, latestAt }, NOW)).toBeNull();
  });

  test('refuses inside the cooldown, past five per address and past twenty per network', () => {
    const latestAt = new Date(NOW.getTime() - RESEND_COOLDOWN_MS + 1);
    expect(codeRefusal({ ...fresh, latestAt }, NOW)).toBe('resend cooldown');
    expect(codeRefusal({ ...fresh, emailCount: CODES_PER_EMAIL }, NOW)).toBe(
      'address hourly limit',
    );
    expect(codeRefusal({ ...fresh, ipCount: CODES_PER_IP }, NOW)).toBe('network hourly limit');
    expect(codeRefusal({ ...fresh, ipCount: CODES_PER_IP - 1 }, NOW)).toBeNull();
  });
});

describe('checkRefusal', () => {
  test('allows ten checks per address and sixty per network in the window', () => {
    expect(
      checkRefusal({ emailCount: CHECKS_PER_EMAIL - 1, ipCount: CHECKS_PER_IP - 1 }),
    ).toBeNull();
    expect(checkRefusal({ emailCount: CHECKS_PER_EMAIL, ipCount: 0 })).toBe('address check limit');
    expect(checkRefusal({ emailCount: 0, ipCount: CHECKS_PER_IP })).toBe('network check limit');
  });
});
