import { describe, expect, test } from 'bun:test';
import packageJson from '../../../../package.json' with { type: 'json' };
import { createRouter } from '../factory.ts';
import { mountApiDocs } from '../openapi.ts';

/** A fresh router per test rather than the shared `app`: mounting is a one-way mutation, and the
   switch is what is under test. */
describe('mountApiDocs', () => {
  test('mounts nothing when docs are off', async () => {
    const router = createRouter();
    mountApiDocs(router, false);

    expect((await router.request('/openapi.json')).status).toBe(404);
    expect((await router.request('/docs')).status).toBe(404);
  });

  test('serves the document with the package version, and the reference UI', async () => {
    const router = createRouter();
    mountApiDocs(router, true);

    const spec = await (await router.request('/openapi.json')).json();
    const docs = await router.request('/docs');

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.version).toBe(packageJson.version);
    expect(docs.status).toBe(200);
    expect(docs.headers.get('content-type')).toContain('text/html');
  });
});
