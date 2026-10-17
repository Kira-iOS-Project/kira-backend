/**
 * Keyset cursors (AGENTS.md Rule 29): the sort instant and the id of the last row a page showed,
 * as one opaque URL-safe string. A cursor the API did not mint decodes to null.
 */

import { z } from '@hono/zod-openapi';

export type Cursor = { at: Date; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.at.toISOString()}|${cursor.id}`).toString('base64url');
}

export function decodeCursor(value: string): Cursor | null {
  const [at = '', id = '', ...rest] = Buffer.from(value, 'base64url').toString().split('|');
  const instant = new Date(at);
  if (rest.length > 0 || !UUID.test(id) || Number.isNaN(instant.getTime())) return null;
  return { at: instant, id };
}

/** A query parameter that must hold a cursor this API minted (a 422 otherwise). */
export const cursorParamSchema = z
  .string()
  .refine((value) => decodeCursor(value) !== null, { message: 'Unknown cursor.' });

/** A page size: 30 unless asked, at most `max`. */
export function limitParamSchema(max: number) {
  return z.coerce.number().int().min(1).max(max).default(30);
}
