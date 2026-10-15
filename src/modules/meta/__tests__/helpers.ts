/**
 * Mock builders for `meta.service.ts`'s injected dependencies, local to this module until another
 * module needs the same shape (AGENTS.md Rule 19).
 */

import type { DbLike } from '../meta.service.ts';

export function createDbMock(overrides: Partial<DbLike> = {}): DbLike {
  return {
    execute: async () => undefined,
    ...overrides,
  };
}
