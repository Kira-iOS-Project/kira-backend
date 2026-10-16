import { ServiceUnavailableError } from '../../lib/errors/errors.ts';

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
