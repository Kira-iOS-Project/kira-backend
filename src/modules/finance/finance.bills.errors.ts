import { NotFoundError } from '../../lib/errors/errors.ts';

/** A recurring bill schedule is missing, archived, or belongs to someone else. */
export class BillNotFoundError extends NotFoundError {
  constructor() {
    super('This bill schedule was not found.', undefined, 'BILL_NOT_FOUND');
  }
}
