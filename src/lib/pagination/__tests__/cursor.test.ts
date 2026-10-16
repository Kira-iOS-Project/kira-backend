import { describe, expect, test } from 'bun:test';
import { cursorParamSchema, decodeCursor, encodeCursor, limitParamSchema } from '../cursor.ts';

const ID = '3f1d2c4b-5a6e-4f70-8b91-a2c3d4e5f607';
const AT = new Date('2026-10-16T05:41:00.000Z');

describe('cursor', () => {
  test('round-trips the instant and the id', () => {
    expect(decodeCursor(encodeCursor({ at: AT, id: ID }))).toEqual({ at: AT, id: ID });
  });

  test('decodes a string it did not mint to null', () => {
    const encode = (text: string) => Buffer.from(text).toString('base64url');
    expect(decodeCursor('nonsense')).toBeNull();
    expect(decodeCursor(encode(`not-a-date|${ID}`))).toBeNull();
    expect(decodeCursor(encode(`${AT.toISOString()}|not-an-id`))).toBeNull();
    expect(decodeCursor(encode(`${AT.toISOString()}|${ID}|extra`))).toBeNull();
  });

  test('validates cursor and limit query parameters', () => {
    expect(cursorParamSchema.safeParse('nonsense').success).toBe(false);
    expect(limitParamSchema(50).parse(undefined)).toBe(30);
    expect(limitParamSchema(50).parse('12')).toBe(12);
    expect(limitParamSchema(50).safeParse('51').success).toBe(false);
  });
});
