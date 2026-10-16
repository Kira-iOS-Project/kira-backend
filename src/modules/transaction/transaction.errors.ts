import { NotFoundError } from '../../lib/errors/errors.ts';

export class TransactionNotFoundError extends NotFoundError {
  constructor() {
    super('The transaction was not found.', undefined, 'TRANSACTION_NOT_FOUND');
  }
}
