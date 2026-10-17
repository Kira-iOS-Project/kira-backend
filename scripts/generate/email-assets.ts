#!/usr/bin/env bun
/**
 * Renders the images every Kira email shows into public/email/ (`bun run generate:email-assets`).
 *
 * Email clients read neither web fonts nor SVG, so src/lib/email/layout.ts shows the hero header,
 * the icons, the logo mark and the handwritten line as PNGs. Each one is drawn here from the design
 * system's own React components, exactly as the canvas board EmailKodeVerifikasi (ONB-15) draws
 * it, and screenshotted by headless Google Chrome at 2× pixel density.
 *
 *   bun run generate:email-assets -- --design-system <dir> --fonts <dir> [--chrome <binary>]
 *
 *   --design-system  the canvas project folder: kira-tokens.css and ds/kira/components/bundle.{js,css}
 *   --fonts          kira-mobile-ios/App/Fonts (PlusJakartaSans/ and Kalam/)
 *   --chrome         the Chrome binary; defaults to the macOS install
 *
 * React 18.3.1 loads from cdnjs, so rendering needs the network. Assets that are not a full
 * rectangle keep a transparent background.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'public/email');
const REACT = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js';
const REACT_DOM =
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js';
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** The tokens' hairline (#1e23201a) blended onto the raised surface, as layout.ts uses it. */
const HAIRLINE_ON_RAISED = '#e8e9e8';

type Asset = {
  name: string;
  width: number;
  height: number;
  /** A full rectangle paints every pixel; anything else keeps the transparent background. */
  opaque: boolean;
  /** The body of a script that returns the React element, with `h` and `Kira` in scope. */
  element: string;
};

/** The header of the board: hero green, the hills, the flipped twig, the wordmark, the overline. */
function header(name: string, overline: string): Asset {
  return {
    name: `header-${name}`,
    width: 552,
    height: 128,
    opaque: true,
    element: `return h('header', { style: { position: 'relative', isolation: 'isolate', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: 552, height: 128, boxSizing: 'border-box', padding: '0 36px 22px', background: 'var(--hero)', color: 'var(--on-hero)' } },
      h('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: -1 } }, h(Kira.Scenery, { tone: 'hero', height: 70 })),
      h('div', { style: { position: 'absolute', top: -26, right: -24, zIndex: -1, pointerEvents: 'none' } }, h(Kira.Leaf, { name: 'ranting', tone: 'hero', size: 130, flip: true })),
      h(Kira.Logo, { variant: 'wordmark', tone: 'hero', size: 38, label: 'Kira' }),
      h('span', { className: 't-overline', style: { fontSize: 12, letterSpacing: '0.08em', fontWeight: 700, color: 'var(--on-hero-muted)' } }, ${JSON.stringify(overline)}));`,
  };
}

/** A notice icon: a 32 px white circle with a hairline, the 17 px icon in pandan inside. */
function badge(icon: string): Asset {
  return {
    name: icon,
    width: 32,
    height: 32,
    opaque: false,
    element: `return h('span', { style: { display: 'grid', placeItems: 'center', width: 32, height: 32, boxSizing: 'border-box', borderRadius: '50%', background: 'var(--surface-raised)', border: '1px solid ${HAIRLINE_ON_RAISED}', color: 'var(--pandan)' } }, h(Kira.Icon, { name: ${JSON.stringify(icon)}, size: 17, strokeWidth: 2 }));`,
  };
}

const ASSETS: Asset[] = [
  header('code', 'Kode verifikasi'),
  header('renewal', 'Pengingat langganan'),
  header('scholarship', 'Beasiswa Kira'),
  header('deletion', 'Akun dihapus'),
  header('export', 'Data kamu'),
  {
    name: 'clock',
    width: 16,
    height: 16,
    opaque: false,
    element: `return h('span', { style: { display: 'block', color: 'var(--ink-muted)' } }, h(Kira.Icon, { name: 'clock', size: 16, strokeWidth: 2 }));`,
  },
  ...['lock', 'calendar', 'gift', 'shield', 'file'].map(badge),
  {
    name: 'mark',
    width: 28,
    height: 28,
    opaque: false,
    /** The mark's vein is drawn in the colour behind it: the footer's raised surface. */
    element: `return h('span', { style: { display: 'block', '--k-logo-bg': 'var(--surface-raised)' } }, h(Kira.Logo, { variant: 'mark', size: 28, label: 'Kira' }));`,
  },
  {
    name: 'tagline',
    width: 197,
    height: 19,
    opaque: false,
    element: `return h('span', { className: 't-hand-sm', style: { display: 'block', whiteSpace: 'nowrap', color: 'var(--pandan)' } }, 'pelan-pelan, uangmu tumbuh');`,
  },
];

function file(path: string): string {
  return pathToFileURL(path).href;
}

function page(asset: Asset, designSystem: string, fonts: string): string {
  return `<!doctype html><html lang="id" data-theme="light"><head><meta charset="utf-8">
<style>
@font-face { font-family: 'Plus Jakarta Sans'; font-weight: 200 800; src: url('${file(join(fonts, 'PlusJakartaSans/PlusJakartaSans-VariableFont_wght.ttf'))}'); }
@font-face { font-family: 'Kalam'; font-weight: 400; src: url('${file(join(fonts, 'Kalam/Kalam-Regular.ttf'))}'); }
</style>
<link rel="stylesheet" href="${file(join(designSystem, 'kira-tokens.css'))}">
<link rel="stylesheet" href="${file(join(designSystem, 'ds/kira/components/bundle.css'))}">
<style>html, body { margin: 0; background: transparent; overflow: hidden; } #root { width: ${asset.width}px; height: ${asset.height}px; }</style>
<script src="${REACT}"></script><script src="${REACT_DOM}"></script>
<script src="${file(join(designSystem, 'ds/kira/components/bundle.js'))}"></script>
</head><body><div id="root"></div>
<script>
const h = React.createElement;
const element = (() => { ${asset.element} })();
document.fonts.load("16px 'Plus Jakarta Sans'").then(() => document.fonts.load('16px Kalam')).then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(element);
});
</script></body></html>`;
}

async function render(asset: Asset, html: string, chrome: string): Promise<void> {
  const target = join(OUT, `${asset.name}.png`);
  const proc = Bun.spawn(
    [
      chrome,
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--force-device-scale-factor=2',
      `--window-size=${asset.width},${asset.height}`,
      '--virtual-time-budget=5000',
      ...(asset.opaque ? [] : ['--default-background-color=00000000']),
      `--screenshot=${target}`,
      file(html),
    ],
    { stdout: 'ignore', stderr: 'ignore' },
  );
  if ((await proc.exited) !== 0) throw new Error(`Chrome failed on ${asset.name}`);
  console.log(`generate:email-assets: wrote public/email/${asset.name}.png`);
}

const { values } = parseArgs({
  options: {
    'design-system': { type: 'string' },
    fonts: { type: 'string' },
    chrome: { type: 'string', default: MAC_CHROME },
  },
});
if (!values['design-system'] || !values.fonts) {
  console.error('generate:email-assets: pass --design-system <dir> and --fonts <dir>.');
  process.exit(1);
}
const designSystem = resolve(values['design-system']);
const fonts = resolve(values.fonts);
const work = mkdtempSync(join(tmpdir(), 'kira-email-assets-'));
mkdirSync(OUT, { recursive: true });
try {
  await Promise.all(
    ASSETS.map((asset) => {
      const html = join(work, `${asset.name}.html`);
      writeFileSync(html, page(asset, designSystem, fonts));
      return render(asset, html, values.chrome);
    }),
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
