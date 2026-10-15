/**
 * The Pino logger (AGENTS.md Rule 23: never `console.*`). Pretty in development, JSON lines
 * everywhere else, silent under test unless LOG_LEVEL says otherwise.
 *
 * Kira holds people's money data, so the keys below never reach a log line whatever object they
 * sit in; log an id, never the value.
 */

import pino from 'pino';
import { env } from '../../env.ts';
import { SERVICE_NAME } from '../constants/service.ts';

const DEFAULT_LEVEL = { development: 'debug', production: 'info', test: 'silent' } as const;

/** Spread rather than `transport: cond ? {...} : undefined`: under `exactOptionalPropertyTypes` an
   explicit `undefined` is not an absent key, and Pino's options do not accept it. */
const pretty =
  env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
        },
      }
    : {};

export const logger = pino({
  level: env.LOG_LEVEL ?? DEFAULT_LEVEL[env.NODE_ENV],
  base: { service: SERVICE_NAME },
  redact: {
    paths: [
      'authorization',
      '*.authorization',
      'cookie',
      '*.cookie',
      'password',
      '*.password',
      'token',
      '*.token',
      'email',
      '*.email',
    ],
    censor: '[redacted]',
  },
  ...pretty,
});
