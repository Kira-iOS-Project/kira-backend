import { ConflictError, NotFoundError } from '../../lib/errors/errors.ts';

/** No such goal for this person. */
export class GoalNotFoundError extends NotFoundError {
  constructor() {
    super('The goal was not found.', undefined, 'GOAL_NOT_FOUND');
  }
}

/** A person keeps one emergency fund; the app opens the one there is. */
export class GoalEmergencyExistsError extends ConflictError {
  constructor() {
    super('There is already an emergency fund goal.', undefined, 'GOAL_EMERGENCY_EXISTS');
  }
}

/** The deposit's id was already used on another goal; the app makes a new id and tries again. */
export class GoalDepositConflictError extends ConflictError {
  constructor() {
    super('This deposit id was already used.', undefined, 'GOAL_DEPOSIT_CONFLICT');
  }
}
