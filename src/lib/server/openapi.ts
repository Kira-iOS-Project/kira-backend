/**
 * The live OpenAPI document (`/openapi.json`) and its reference UI (`/docs`).
 *
 * A convenience, not the contract: the committed openapi.json (`bun run spec:export`) is what the
 * iOS client is generated from. Off in production unless DOCS_ENABLED=true (src/env.ts), so the
 * public API does not describe itself to everyone who asks.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import packageJson from '../../../package.json' with { type: 'json' };
import type { AppEnv } from './factory.ts';

/** Lib: mountApiDocs
 * Mounts `/openapi.json` and `/docs` on `app` when `enabled`, and nothing otherwise.
 */
export function mountApiDocs(app: OpenAPIHono<AppEnv>, enabled: boolean): void {
  if (!enabled) return;
  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Kira API', version: packageJson.version },
  });
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Kira API' }));
}
