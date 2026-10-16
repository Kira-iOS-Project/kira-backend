import { NotFoundError, ValidationError } from '../../lib/errors/errors.ts';

export class ImportNotFoundError extends NotFoundError {
  constructor() {
    super('The import was not found.', undefined, 'IMPORT_NOT_FOUND');
  }
}

/** Impor Mutasi takes at most three months per file (CAT-11). */
export class ImportRangeTooLongError extends ValidationError {
  constructor(days: number) {
    super('A file may cover at most three months.', `days=${days}`, 'IMPORT_RANGE_TOO_LONG');
  }
}

/**
 * A chosen row is not part of this import, or its category points the other way: a debit saved
 * under an income category (or a credit under an expense one) would turn money out into money in.
 */
export class ImportRowUnknownError extends ValidationError {
  constructor(reason = 'not in this import') {
    super(
      'A row is not part of this import, or its category does not match it.',
      reason,
      'IMPORT_ROW_UNKNOWN',
    );
  }
}
