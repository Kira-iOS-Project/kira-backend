import { ForbiddenError, ValidationError } from '../../lib/errors/errors.ts';

/** Kira AI is off in Persetujuan Data: chat, receipts and voice stop, Catat Manual still works. */
export class AiDisabledError extends ForbiddenError {
  constructor() {
    super('Kira AI is turned off in your privacy settings.', undefined, 'CHAT_AI_DISABLED');
  }
}

/** The receipt's items do not add up to its total (CAT-06: the engine checks the AI's reading). */
export class ReceiptTotalMismatchError extends ValidationError {
  constructor(total: number, sum: number) {
    super(
      'The items do not add up to the total.',
      `total=${total} sum=${sum}`,
      'RECEIPT_TOTAL_MISMATCH',
    );
  }
}
