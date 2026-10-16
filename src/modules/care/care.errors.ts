import { NotFoundError } from '../../lib/errors/errors.ts';

/** No pending (or seen) check-in of this person has that id. */
export class CareCheckInNotFoundError extends NotFoundError {
  constructor() {
    super('That check-in does not exist.', undefined, 'CARE_CHECK_IN_NOT_FOUND');
  }
}

/** The person has not written a safety plan yet. */
export class CareSafetyPlanNotFoundError extends NotFoundError {
  constructor() {
    super('There is no safety plan yet.', undefined, 'CARE_SAFETY_PLAN_NOT_FOUND');
  }
}
