/**
 * The comment reader and rewriter behind scripts/check/comment-style.mjs (AGENTS.md Rule 49).
 *
 * `comments()` is a small tokenizer (the one agent-config-kit's check-comment-style.mjs uses), so a
 * `//` or `/*` inside a string, a template literal or a regular expression is never a comment.
 * `rewrite()` turns a run of whole-line `//` comments into one `/** … *\/` block and a comment after
 * code into `/** … *\/` on the same line; a `/*` that does not open `/**` gains the second `*`.
 */

const DIRECTIVE =
  /^\/\/\/?\s*(@ts-expect-error|@ts-ignore|@ts-check|@ts-nocheck|oxlint-disable|eslint-disable|v8 ignore|<reference\s|swift-tools-version|swiftlint:|periphery:ignore)/;
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
    const before = prev.trimEnd();
    if (
      c === '/' &&
      (before === '' || !VALUE_CANNOT_FOLLOW.test(before) || KEYWORDS_BEFORE_REGEX.test(before))
    ) {
      skipRegex();
      prev = 'x';
      continue;
    }
    prev = (prev + c).slice(-32);
    i++;
  }
  return found;
}

/** The comments that break the rule: `//` anywhere, `/*` too when the file is the repo's own. */
export function findings(source, owned) {
  return comments(source).filter((c) =>
    c.kind === 'line'
      ? !DIRECTIVE.test(c.text)
      : owned && !c.text.startsWith('/**') && c.text !== '/**/',
  );
}

/** A run of whole-line comments as one block: JSDoc-style lines, or bare lines for Swift. */
function asBlock(bodies, indent, swift) {
  if (bodies.length === 1) return `${indent}/** ${bodies[0]} */`;
  const inner = bodies.map((b) =>
    swift ? `${indent} ${b}`.trimEnd() : `${indent} * ${b}`.trimEnd(),
  );
  return [`${indent}/**`, ...inner, `${indent} */`].join('\n');
}

/** The source with every finding rewritten, and the comments that cannot be (a body holding `*\/`). */
export function rewrite(source, owned, { swift = false } = {}) {
  const stuck = [];
  const all = findings(source, owned);
  let out = source;
  for (let k = all.length - 1; k >= 0; k--) {
    const c = all[k];
    if (c.kind === 'block') {
      out = `${out.slice(0, c.start)}/**${out.slice(c.start + 2)}`;
      continue;
    }
    /** Gather the run of whole-line comments this one ends, walking back through `all`. */
    let first = k;
    while (
      !c.trailing &&
      first > 0 &&
      all[first - 1].kind === 'line' &&
      !all[first - 1].trailing &&
      /^[ \t]*$/.test(source.slice(all[first - 1].end + 1, all[first].start))
    )
      first--;
    const run = all.slice(first, k + 1);
    const bodies = run.map((r) => r.text.replace(/^\/\/+\s?/, '').trimEnd());
    if (bodies.some((b) => b.includes('*/'))) {
      stuck.push(...run);
      k = first;
      continue;
    }
    const lineStart = source.lastIndexOf('\n', run[0].start - 1) + 1;
    const indent = c.trailing ? '' : source.slice(lineStart, run[0].start);
    const text = c.trailing
      ? `/** ${bodies[0]} */`
      : asBlock(bodies, indent, swift).slice(indent.length);
    out = `${out.slice(0, run[0].start)}${text}${out.slice(c.end)}`;
    k = first;
  }
  return { out, stuck };
}
