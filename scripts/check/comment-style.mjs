#!/usr/bin/env node
/**
 * Comment style (AGENTS.md Rule 49): comments are `/** … *\/`, never `//`.
 *
 * Reads every tracked JavaScript and TypeScript file, and the fenced TypeScript, JavaScript and Swift
 * examples of every Markdown file. A `//` comment is allowed only as a directive a tool reads
 * (scripts/lib/comments.mjs lists them), in every file. The repo's own files also open every block
 * comment with `/**`; files the kit manages (the `files` of .claude/agent-config-kit.lock) keep the
 * kit's `/* … *\/` notes, and --fix never rewrites them: a `//` there means taking the file over first.
 *
 *   node scripts/check/comment-style.mjs         report; exit 1 on any finding
 *   node scripts/check/comment-style.mjs --fix   rewrite what can be rewritten, then report
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { findings, rewrite } from '../lib/comments.mjs';

/** Installed packages, build output, generator output and the migrations drizzle-kit writes. */
const EXCLUDED = /(^|\/)(node_modules|dist|generated|GeneratedSources|migrations)\//;
const CODE = /\.[cm]?[jt]sx?$/;
const FENCE_LANGS = new Set(['ts', 'typescript', 'tsx', 'js', 'javascript', 'jsx', 'mjs', 'swift']);

const fix = process.argv.includes('--fix');
const lockPath = '.claude/agent-config-kit.lock';
const managed = new Set();
if (existsSync(lockPath)) {
  for (const entry of Object.values(JSON.parse(readFileSync(lockPath, 'utf8')).plugins ?? {})) {
    for (const file of Object.keys(entry.files ?? {})) managed.add(file);
  }
}

/** The fenced code blocks of a Markdown file worth checking: `{ start, end, swift }` offsets. */
function fences(markdown) {
  const blocks = [];
  const re = /^([ \t]*)```(\w*)[^\n]*\n([\s\S]*?)^\1```/gm;
  for (const m of markdown.matchAll(re)) {
    if (!FENCE_LANGS.has(m[2].toLowerCase())) continue;
    const start = m.index + m[0].indexOf('\n') + 1;
    blocks.push({ start, end: start + m[3].length, swift: m[2].toLowerCase() === 'swift' });
  }
  return blocks;
}

/** One file's findings as `{ line, text }`, after rewriting it when --fix is on. */
function check(file) {
  const owned = !managed.has(file);
  let source = readFileSync(file, 'utf8');
  const parts = file.endsWith('.md')
    ? fences(source)
    : [{ start: 0, end: source.length, swift: false }];
  /** A kit-managed file is never rewritten in place: take it over (agent-sync own) first. */
  if (fix && owned) {
    let out = source;
    for (const p of parts.toReversed()) {
      const { out: body } = rewrite(out.slice(p.start, p.end), owned, { swift: p.swift });
      out = out.slice(0, p.start) + body + out.slice(p.end);
    }
    if (out !== source) writeFileSync(file, out);
    source = out;
  }
  const found = [];
  for (const p of file.endsWith('.md') ? fences(source) : parts) {
    for (const c of findings(source.slice(p.start, p.end), owned)) {
      const line = source.slice(0, p.start + c.start).split('\n').length;
      const text = c.text.split('\n')[0].slice(0, 80);
      found.push({
        line,
        text: owned ? text : `${text}  (kit-managed: agent-sync own it, then --fix)`,
      });
    }
  }
  return found;
}

const files = execFileSync('git', ['ls-files', '-z'])
  .toString()
  .split('\0')
  .filter((f) => (CODE.test(f) || f.endsWith('.md')) && !EXCLUDED.test(f) && existsSync(f));
let total = 0;
for (const file of files) {
  for (const { line, text } of check(file)) {
    console.log(`${file}:${line}: ${text}`);
    total++;
  }
}
console.log(`comment-style: ${files.length} file(s), ${total} comment(s) to write as /** … */`);
process.exit(total > 0 ? 1 : 0);
