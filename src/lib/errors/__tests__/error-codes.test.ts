import { describe, expect, test } from 'bun:test';
import { Glob } from 'bun';
import { ERROR_CODES } from '../error-codes.ts';

/** Every non-test source file, read once. The list is honest only if each code is one the API can
   actually send: a code nothing raises still gets a row and copy in the app, for nobody. */
const sources = await Promise.all(
  Array.from(new Glob('src/**/*.ts').scanSync('.'))
    .filter((path) => !path.includes('__tests__') && !path.endsWith('error-codes.ts'))
    .map((path) => Bun.file(path).text()),
);
const corpus = sources.join('\n');

describe('ERROR_CODES', () => {
  test('holds no duplicates', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  test.each([...ERROR_CODES])('%s is upper snake case', (code) => {
    expect(code).toMatch(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/);
  });

  test.each([...ERROR_CODES])('%s is raised somewhere in src', (code) => {
    expect(corpus).toContain(`'${code}'`);
  });
});
