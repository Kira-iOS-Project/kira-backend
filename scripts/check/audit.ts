#!/usr/bin/env bun
/**
 * Security audit gate — wraps `bun audit --json`.
 *
 * As of Bun 1.3.14 that command had two defects which make it unusable directly:
 *   1. `--audit-level` is accepted but ignored — any advisory at all exits 1
 *   2. the registry's gzip response is never decompressed, so the report is unreadable
 *
 * This decodes the response, keeps only advisories that match a version actually
 * installed, and fails on high/critical alone. When Bun starts decompressing its
 * own output the plain-JSON branch takes over, so this keeps working unchanged.
 *
 * Exit code 1 if a blocking advisory matches an installed version, or if the
 * report cannot be read — an unreadable security report is never a pass.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BLOCKING = new Set(['high', 'critical']);

interface Advisory {
  url: string;
  title: string;
  severity: string;
  vulnerable_versions: string;
}

type Report = Record<string, Advisory[]>;

/* Structural check only: every value must be an array, which is what the consumers iterate.
   The fields inside an Advisory are not re-validated — a missing `title` prints as undefined,
   which is cosmetic, whereas a non-array value would throw mid-loop. */
function isReport(value: unknown): value is Report {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry) => Array.isArray(entry))
  );
}

/* ── Run bun audit and decode whatever it hands back ── */

function readReport(): Report {
  const proc = Bun.spawnSync(['bun', 'audit', '--json'], { stdout: 'pipe', stderr: 'pipe' });
  const raw = new Uint8Array(proc.stdout);

  /* No advisories at all — bun writes nothing and exits 0. Nothing on stdout with any other exit
     code is a run that never got a report: an unreachable registry exits 1 that way. */
  if (raw.length === 0) {
    if (proc.exitCode === 0) return {};
    const reason = new TextDecoder().decode(proc.stderr).trim().split('\n').at(-1);
    throw new Error(`bun audit exited ${proc.exitCode} without a report: ${reason || 'no output'}`);
  }

  const isGzipped = raw[0] === 0x1f && raw[1] === 0x8b;
  let text: string;
  try {
    text = new TextDecoder().decode(isGzipped ? Bun.gunzipSync(raw) : raw);
  } catch (error: unknown) {
    throw new Error(`could not decode audit output: ${getMessage(error)}`, { cause: error });
  }

  /* Bun prefixes a version banner when stdout is a TTY; drop anything before the JSON. */
  const start = text.indexOf('{');
  if (start === -1) throw new Error('audit output contained no JSON object');

  try {
    /* Annotated as `unknown` and then narrowed, rather than asserted straight from the `any`
       JSON.parse returns. `bun audit --json` is another tool's output, so its shape is a claim
       we are making about it, not a fact — and an assertion would let a changed format reach
       the loops below as undefined rather than failing here with a readable message. */
    const parsed: unknown = JSON.parse(text.slice(start));

    if (!isReport(parsed)) throw new Error('audit JSON was not an object of advisory lists');

    return parsed;
  } catch (error: unknown) {
    throw new Error(`could not parse audit JSON: ${getMessage(error)}`, { cause: error });
  }
}

function getMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unexpected error';
}

/* ── Map every installed copy of every package to its version(s) ── */

function collectInstalled(nodeModules: string, found: Map<string, Set<string>>): void {
  let entries;
  try {
    entries = readdirSync(nodeModules, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;

    /* Scope directories hold packages one level deeper. */
    if (entry.name.startsWith('@')) {
      collectInstalled(join(nodeModules, entry.name), found);
      continue;
    }

    const pkgDir = join(nodeModules, entry.name);
    try {
      const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
      if (pkg.name && pkg.version) {
        const versions = found.get(pkg.name) ?? new Set<string>();
        versions.add(pkg.version);
        found.set(pkg.name, versions);
      }
    } catch {
      /* Not a package directory — skip it. */
    }

    collectInstalled(join(pkgDir, 'node_modules'), found);
  }
}

/* ── Match advisories against what is actually installed ── */

interface Finding {
  name: string;
  versions: string[];
  advisory: Advisory;
}

function findBlocking(report: Report, installed: Map<string, Set<string>>): Finding[] {
  const findings: Finding[] = [];

  for (const [name, advisories] of Object.entries(report)) {
    const present = [...(installed.get(name) ?? [])];
    for (const advisory of advisories) {
      if (!BLOCKING.has(advisory.severity)) continue;
      const hit = present.filter((v) => Bun.semver.satisfies(v, advisory.vulnerable_versions));
      if (hit.length > 0) findings.push({ name, versions: hit, advisory });
    }
  }

  return findings;
}

/* ── Accepted advisories ── */

/* An advisory listed here is reported but does not fail the gate, until its `reviewBy` date. Each
   entry names the exact advisory and package and says why it cannot reach a user. After `reviewBy`
   the gate fails on it again, so an acceptance is re-decided rather than forgotten. Only for an
   advisory with no patched release: a fixable one is fixed with a bump or "overrides". Empty: nothing is
   accepted today. */
interface Accepted {
  url: string;
  name: string;
  reason: string;
  reviewBy: string;
}

const ACCEPTED: Accepted[] = [];

function acceptanceFor(finding: Finding): Accepted | undefined {
  return ACCEPTED.find(
    (entry) => entry.name === finding.name && entry.url === finding.advisory.url,
  );
}

/* ── Output ── */

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(line: string): void {
  process.stderr.write(`${line}\n`);
}

/* ── Report ── */

let report: Report;
try {
  report = readReport();
} catch (error: unknown) {
  fail(`[audit] ✗ ${getMessage(error)}`);
  process.exit(1);
}

const installed = new Map<string, Set<string>>();
collectInstalled(join(process.cwd(), 'node_modules'), installed);

const findings = findBlocking(report, installed);
const advisoryCount = Object.values(report).reduce((n, list) => n + list.length, 0);
const today = new Date().toISOString().slice(0, 10);

const accepted = findings.flatMap((finding) => {
  const entry = acceptanceFor(finding);
  return entry !== undefined && today <= entry.reviewBy ? [{ finding, entry }] : [];
});
const blocking = findings.filter((finding) => !accepted.some((item) => item.finding === finding));

out(`[audit] ${advisoryCount} advisories reported, ${installed.size} packages installed`);

for (const { finding, entry } of accepted) {
  out(
    `[audit] ⚠ accepted until ${entry.reviewBy}: ${finding.name}@${finding.versions.join(', ')} — ${finding.advisory.severity}`,
  );
  out(`    ${finding.advisory.url}`);
  out(`    ${entry.reason}`);
}

if (blocking.length === 0) {
  out(
    accepted.length === 0
      ? '[audit] ✓ No high or critical advisories affect installed versions.'
      : '[audit] ✓ No other high or critical advisories affect installed versions.',
  );
  process.exit(0);
}

fail(`\n[audit] ✗ ${blocking.length} blocking advisories:\n`);
for (const finding of blocking) {
  const { name, versions, advisory } = finding;
  fail(`  ${name}@${versions.join(', ')} — ${advisory.severity}`);
  fail(`    ${advisory.title}`);
  fail(`    affects ${advisory.vulnerable_versions} · ${advisory.url}`);
  const expired = acceptanceFor(finding);
  if (expired)
    fail(
      `    accepted until ${expired.reviewBy}, now expired: decide again, then fix or renew the entry`,
    );
  fail('');
}
fail('[audit] Fix with a dependency bump, or pin a patched version via "overrides".');
process.exit(1);
