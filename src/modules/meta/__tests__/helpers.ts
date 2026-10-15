/**
 * Mock builders for the meta module's injected dependencies: the database client the repository
 * takes, and the repository the service takes. Local to this module until another module needs the
 * same shape (AGENTS.md Rule 19).
 */

import type { DbLike, MetaRepository } from '../meta.repository.ts';

export function createDbMock(overrides: Partial<DbLike> = {}): DbLike {
  return {
    execute: async () => undefined,
    ...overrides,
  };
}

export function createMetaRepositoryMock(overrides: Partial<MetaRepository> = {}): MetaRepository {
  return {
    ping: async () => undefined,
    ...overrides,
  };
}
