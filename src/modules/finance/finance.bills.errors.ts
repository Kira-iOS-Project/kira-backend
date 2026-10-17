import { NotFoundError } from '../../lib/errors/errors.ts';

/** No such bill for this person. */
export class BillNotFoundError extends NotFoundError {
  constructor() {
    super('The bill was not found.', undefined, 'BILL_NOT_FOUND');
  }
}

/** "Ini Cicilan Utang" named a debt account this person does not have. */
export class BillDebtNotFoundError extends NotFoundError {
  constructor() {
    super('The debt account was not found.', undefined, 'BILL_DEBT_NOT_FOUND');
  }
}
