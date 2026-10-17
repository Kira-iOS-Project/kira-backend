import {
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../../lib/errors/errors.ts';

/** Too many codes asked for one address or from one network in the last hour, or too soon. */
export class CodeRateLimitedError extends TooManyRequestsError {
  constructor(reason: string) {
    super(
      'Too many codes were requested. Wait a moment and try again.',
      reason,
      'AUTH_CODE_RATE_LIMITED',
    );
  }
}

/** Too many codes checked for one address or from one network in fifteen minutes. */
export class VerifyRateLimitedError extends TooManyRequestsError {
  constructor(reason: string) {
    super(
      'Too many sign-in tries. Wait a few minutes and try again.',
      reason,
      'AUTH_VERIFY_RATE_LIMITED',
    );
  }
}

/** The code does not match the latest one sent to the address, or none was sent. */
export class CodeInvalidError extends ValidationError {
  constructor() {
    super('The code is not right.', undefined, 'AUTH_CODE_INVALID');
  }
}

export class CodeExpiredError extends ValidationError {
  constructor() {
    super('The code has expired. Ask for a new one.', undefined, 'AUTH_CODE_EXPIRED');
  }
}

/** Five wrong tries end a code: asking for a new one is the way on. */
export class CodeAttemptsExceededError extends TooManyRequestsError {
  constructor() {
    super('Too many wrong tries. Ask for a new code.', undefined, 'AUTH_CODE_ATTEMPTS_EXCEEDED');
  }
}

export class UnauthenticatedError extends UnauthorizedError {
  constructor(reason: string) {
    super('Sign in to continue.', reason, 'AUTH_UNAUTHENTICATED');
  }
}

/** The refresh token is unknown, expired, revoked or was already used. */
export class RefreshInvalidError extends UnauthorizedError {
  constructor(reason: string) {
    super('The session has ended. Sign in again.', reason, 'AUTH_REFRESH_INVALID');
  }
}

export class EmailDeliveryFailedError extends ServiceUnavailableError {
  constructor(reason: string) {
    super(
      'The email could not be sent right now. Try again in a moment.',
      reason,
      'EMAIL_DELIVERY_FAILED',
    );
  }
}
