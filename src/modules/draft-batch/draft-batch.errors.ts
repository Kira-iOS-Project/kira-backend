import { ConflictError, NotFoundError } from '../../lib/errors/errors.ts';

export class MessageNotFoundError extends NotFoundError {
  constructor() {
    super('The message was not found.', undefined, 'CHAT_MESSAGE_NOT_FOUND');
  }
}

/** The drafts were already saved or discarded, or the message holds none. */
export class DraftsNotPendingError extends ConflictError {
  constructor(reason: string) {
    super('These drafts are no longer waiting to be saved.', reason, 'CHAT_DRAFTS_NOT_PENDING');
  }
}

export class BatchNotFoundError extends NotFoundError {
  constructor() {
    super('Those transactions were not found.', undefined, 'TRANSACTION_BATCH_NOT_FOUND');
  }
}

/** Urungkan is offered for a short while after Simpan (CAT-03). */
export class UndoExpiredError extends ConflictError {
  constructor() {
    super('It is too late to undo this save.', undefined, 'TRANSACTION_UNDO_EXPIRED');
  }
}
