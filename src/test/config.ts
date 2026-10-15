/**
 * The switch for the integration tier (AGENTS.md Rule 20). `bun test src` runs the unit tier only;
 * `bun run test:integration` also runs each `*.integration.test.ts` against a real Postgres:
 *
 *   const testIntegration = shouldRunIntegrationTests() ? test : test.skip;
 *   testIntegration('persists a row', async () => { ... });
 */
export function shouldRunIntegrationTests(): boolean {
  return process.env.RUN_INTEGRATION_TESTS === '1';
}
