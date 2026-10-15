#!/usr/bin/env node
/**
 * Comment style (AGENTS.md Rule 49): comments are `/** … *\/`, never `//`.
 *
 * Every tracked JavaScript and TypeScript file may hold a `//` comment only as a directive a tool
 * reads (@ts-expect-error, @ts-ignore, oxlint-disable, eslint-disable, v8 ignore, a triple-slash
 * reference). The files this repo owns also open every block comment with `/**`; the files the kit
 * manages (the `files` of .claude/agent-config-kit.lock) keep the kit's `/* … *\/` notes, so a sync
 * never reports them as drift.
 *
 *   node scripts/check/comment-style.mjs         report; exit 1 on any finding
 *   node scripts/check/comment-style.mjs --fix   rewrite what can be rewritten, then report
 *
 * A small tokenizer reads the files (the one agent-config-kit's check-comment-style.mjs uses), so a
 * `//` or `/*` inside a string, a template literal or a regular expression is never a comment.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const DIRECTIVE =
  /^\/\/\/?\s*(@ts-expect-error|@ts-ignore|@ts-check|@ts-nocheck|oxlint-disable|eslint-disable|v8 ignore|<reference\s)/;
/** Installed packages, build output, generator output and the migrations drizzle-kit writes. */
const EXCLUDED = /(^|\/)(node_modules|dist|generated|migrations)\/|\.generated\.[cm]?[jt]sx?$/;
const VALUE_CANNOT_FOLLOW = /[\w$)\]]$/;
const KEYWORDS_BEFORE_REGEX =
  /\b(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

/** Every comment in the source: `{ kind: 'line' | 'block', start, end, text, trailing }`. */
function comments(source) {
  const found = [];
  const templates = [];
  const n = source.length;
  let i = 0;
  let prev = '';
  const skipTemplate = () => {
    while (i < n) {
      if (source[i] === '\\') {
        i += 2;
        continue;
      }
      if (source[i] === '`') {
        i++;
        return;
      }
      if (source[i] === '$' && source[i + 1] === '{') {
        templates.push(1);
        i += 2;
        return;
      }
      i++;
    }
  };
  /** Moves past a regular-expression literal whose opening `/` is at `i`. */
  const skipRegex = () => {
    i++;
    let inClass = false;
    while (i < n && source[i] !== '\n') {
      const ch = source[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      i++;
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) return;
    }
  };
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '\n') {
      i++;
      prev = '';
      continue;
    }
    if (c === '/' && (next === '/' || next === '*')) {
      const block = next === '*';
      const close = block ? source.indexOf('*/', i + 2) : source.indexOf('\n', i);
      const end = close === -1 ? n : block ? close + 2 : close;
      const lineStart = source.lastIndexOf('\n', i - 1) + 1;
      const trailing = source.slice(lineStart, i).trim() !== '';
      found.push({
        kind: block ? 'block' : 'line',
        start: i,
        end,
        text: source.slice(i, end),
        trailing,
      });
      i = end;
      prev = ' ';
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && source[i] !== c && source[i] !== '\n') i += source[i] === '\\' ? 2 : 1;
      i++;
      prev = 'x';
      continue;
    }
    if (c === '`' || (c === '}' && templates.length > 0)) {
      if (c === '}') templates.pop();
      i++;
      skipTemplate();
      prev = 'x';
      continue;
    }
    if (c === '/') {
      const before = prev.trimEnd();
      if (
        before === '' ||
        !VALUE_CANNOT_FOLLOW.test(before) ||
        KEYWORDS_BEFORE_REGEX.test(before)
      ) {
        skipRegex();
        prev = 'x';
        continue;
      }
    }
    prev = (prev + c).slice(-32);
    i++;
  }
  return found;
}

/** The comments that break the rule in a file: `//` anywhere, `/*` too when the repo owns the file. */
function findings(source, owned) {
  return comments(source).filter((c) =>
    c.kind === 'line'
      ? !DIRECTIVE.test(c.text)
      : owned && !c.text.startsWith('/**') && c.text !== '/**/',
  );
}

/** The source with every finding rewritten as `/** … *\/`, and the findings that cannot be. */
function rewrite(source, owned) {
  const stuck = [];
  let out = source;
  for (const c of findings(source, owned).toReversed()) {
    if (c.kind === 'block') {
      out = `${out.slice(0, c.start)}/**${out.slice(c.start + 2)}`;
      continue;
    }
    const body = c.text.replace(/^\/\/+\s?/, '').trimEnd();
    if (body.includes('*/')) {
      stuck.push(c);
      continue;
    }
    out = `${out.slice(0, c.start)}/** ${body} */${out.slice(c.end)}`;
  }
  return { out, stuck };
}

const fix = process.argv.includes('--fix');
const lockPath = '.claude/agent-config-kit.lock';
const managed = new Set();
if (existsSync(lockPath)) {
  for (const entry of Object.values(JSON.parse(readFileSync(lockPath, 'utf8')).plugins ?? {})) {
    for (const file of Object.keys(entry.files ?? {})) managed.add(file);
  }
}
const files = execFileSync('git', [
  'ls-files',
  '-z',
  '--',
  '*.js',
  '*.mjs',
  '*.cjs',
  '*.ts',
  '*.mts',
  '*.cts',
])
  .toString()
  .split('\0')
  .filter((f) => f && !EXCLUDED.test(f) && existsSync(f));
let total = 0;
for (const file of files) {
  const owned = !managed.has(file);
  let source = readFileSync(file, 'utf8');
  if (fix) {
    const { out } = rewrite(source, owned);
    if (out !== source) writeFileSync(file, out);
    source = out;
  }
  for (const c of findings(source, owned)) {
    const line = source.slice(0, c.start).split('\n').length;
    console.log(`${file}:${line}: ${c.text.split('\n')[0].slice(0, 80)}`);
    total++;
  }
}
console.log(`comment-style: ${files.length} file(s), ${total} comment(s) to write as /** … */`);
process.exit(total > 0 ? 1 : 0);
