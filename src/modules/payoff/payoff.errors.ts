import { NotFoundError, ValidationError } from '../../lib/errors/errors.ts';

/** The extra payment asked for is more than the money left in this payday period. */
export class PayoffExtraTooHighError extends ValidationError {
  constructor() {
    super(
      'The extra payment is more than the money left this period.',
      undefined,
      'PAYOFF_EXTRA_TOO_HIGH',
    );
  }
}

/** The person has no open consumer debt, so there is nothing to plan. */
export class PayoffNothingToPlanError extends ValidationError {
  constructor() {
    super('There is no consumer debt to plan.', undefined, 'PAYOFF_NOTHING_TO_PLAN');
  }
}

/** The person has not made a plan yet (Rencanaku has nothing to show). */
export class PayoffPlanNotFoundError extends NotFoundError {
  constructor() {
    super('There is no active payoff plan.', undefined, 'PAYOFF_PLAN_NOT_FOUND');
  }
}

/** The debt account does not exist, is not the person's, is paid off, or is not in the plan. */
export class PayoffDebtNotFoundError extends NotFoundError {
  constructor() {
    super('This debt account is not open.', undefined, 'PAYOFF_DEBT_NOT_FOUND');
  }
}

/** The payment is more than what is left on the account. */
export class PayoffPaymentTooHighError extends ValidationError {
  constructor() {
    super(
      'The payment is more than what is left on this account.',
      undefined,
      'PAYOFF_PAYMENT_TOO_HIGH',
    );
  }
}
