import { ValidationError } from '../../lib/errors/errors.ts';

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
