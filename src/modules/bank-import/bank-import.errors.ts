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

export class ImportRowUnknownError extends ValidationError {
  constructor() {
    super('A row is not part of this import.', undefined, 'IMPORT_ROW_UNKNOWN');
  }
}
