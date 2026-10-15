#!/usr/bin/env bun
/**
 * Bundles the server for production (`bun run build`): src/index.ts and everything it imports into
 * dist/index.js, the one file the image runs, with no source map.
 *
 * Through `Bun.build` rather than a `bun build` command line: agent-core's safety check reads
 * `bun build` inside a script named `build` as that script calling itself, and refuses it as
 * endless nesting. The same reason keeps a `test` script out of package.json (`bun test src`).
 * Not under scripts/build/: `.gitignore` ignores every folder named build.
 */

const result = await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'bun',
  sourcemap: 'none',
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
for (const output of result.outputs) console.log(`build: ${output.path}`);
