import { ConflictError, NotFoundError } from '../../lib/errors/errors.ts';

/** The person is on Kira Gratis: there is no subscription to show or change. */
export class SubscriptionNotFoundError extends NotFoundError {
  constructor() {
    super('There is no active subscription.', undefined, 'SUBSCRIPTION_NOT_FOUND');
  }
}

/** A Beasiswa Kira grant ends on its own; there is nothing to cancel. */
export class SubscriptionNotCancellableError extends ConflictError {
  constructor(reason: string) {
    super('This subscription cannot be cancelled.', reason, 'SUBSCRIPTION_NOT_CANCELLABLE');
  }
}

/** A Beasiswa Kira grant is free: it has no payment method to change. */
export class SubscriptionNotPaidError extends ConflictError {
  constructor() {
    super('This subscription has no payment method.', 'scholarship grant', 'SUBSCRIPTION_NOT_PAID');
  }
}
