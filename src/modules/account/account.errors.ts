import {
  TooManyRequestsError, ServiceUnavailableError } from '../../lib/errors/errors.ts';

/** Resend refused the data export; nothing changed, so asking again is safe. */
export class ExportEmailFailedError extends ServiceUnavailableError {
  constructor(reason: string) {
    super(
      'The email could not be sent right now. Try again in a moment.',
      reason,
      'EMAIL_DELIVERY_FAILED',
    );
  }
}

/** An export was emailed less than ten minutes ago: the same history would arrive twice. */
export class ExportEmailRateLimitedError extends TooManyRequestsError {
  constructor() {
    super(
      'The data export was emailed a moment ago. Check the inbox, or try again later.',
      undefined,
      'ACCOUNT_EXPORT_RATE_LIMITED',
    );
  }
}
