import { ConflictError, NotFoundError } from '../../lib/errors/errors.ts';

/** On a paid plan, already on a grant, or an application is still open. */
export class ScholarshipNotEligibleError extends ConflictError {
  constructor(reason: string) {
    super('You cannot apply for Beasiswa Kira right now.', reason, 'SCHOLARSHIP_NOT_ELIGIBLE');
  }
}

/** There is no application in review or on the waiting list to withdraw. */
export class ScholarshipApplicationNotFoundError extends NotFoundError {
  constructor() {
    super('There is no open application.', undefined, 'SCHOLARSHIP_APPLICATION_NOT_FOUND');
  }
}
