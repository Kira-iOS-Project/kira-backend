import { NotFoundError } from '../../lib/errors/errors.ts';

/** The health check has not been answered yet, so there is nothing to score. */
export class ScoreNotAvailableError extends NotFoundError {
  constructor() {
    super('Answer the health check to get a Kira Score.', undefined, 'SCORE_NOT_AVAILABLE');
  }
}
