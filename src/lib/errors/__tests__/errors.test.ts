import { describe, expect, test } from 'bun:test';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../errors.ts';

describe('DomainError', () => {
  test('is a 500 when thrown directly', () => {
    const err = new DomainError('Something went wrong.', undefined, 'INTERNAL_ERROR');

    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.name).toBe('DomainError');
  });

  test('keeps internalDetail in the message and out of userMessage', () => {
    const err = new DomainError('Try again later.', 'row 42 locked', 'INTERNAL_ERROR');

    expect(err.userMessage).toBe('Try again later.');
    expect(err.message).toBe('Try again later.: row 42 locked');
  });

  test('omits the detail suffix when there is no internalDetail', () => {
    expect(new DomainError('Gone.', undefined, 'INTERNAL_ERROR').message).toBe('Gone.');
  });
});

describe('DomainError subclasses', () => {
  test.each([
    [NotFoundError, 404],
    [ValidationError, 400],
    [ForbiddenError, 403],
    [ConflictError, 409],
    [ServiceUnavailableError, 503],
    [UnauthorizedError, 401],
    [TooManyRequestsError, 429],
  ] as const)('%p carries status %i and its own name', (ErrorClass, status) => {
    const err = new ErrorClass('Refused.', undefined, 'HTTP_ERROR');

    expect(err).toBeInstanceOf(DomainError);
    expect(err.statusCode).toBe(status);
    expect(err.name).toBe(ErrorClass.name);
    expect(err.code).toBe('HTTP_ERROR');
  });
});
