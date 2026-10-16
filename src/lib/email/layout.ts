/**
 * The one look every Kira email shares, from the canvas board EmailKodeVerifikasi (ONB-15): a
 * 552 px card on the muted surface, the hero header, the content, the footer with the mark and the
 * handwritten line, and a footnote saying why the email came. Each sending module fills in its own
 * words; this file only lays them out.
 *
 * Email clients read neither web fonts nor eight-digit hex colours, and lay out tables more
 * reliably than anything else, so: tables, inline styles, the design tokens' light values with
 * their transparent lines blended onto the surface they sit on, and the hero header, the icons and
 * the handwriting as PNGs under public/email/. Every email also goes out as plain text.
 */

import { env } from '../../env.ts';

/** The light theme of the design system's tokens; `*-on-*` are its hairlines, blended. */
const COLOR = {
  surface: '#f6f5f2',
  surfaceRaised: '#ffffff',
  surfaceMuted: '#efede8',
  line: '#e6e3dd',
  hairlineOnRaised: '#e8e9e8',
  hairlineOnSurface: '#e0e0dd',
  ink: '#1e2320',
  inkMuted: '#5e655f',
  pandan: '#1e6b52',
  pandanSoft: '#e4f1e9',
  pandanLineOnSoft: '#bcd6cb',
} as const;

const DISPLAY_FONT = "'Plus Jakarta Sans', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const TEXT_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

/** The icon PNGs in public/email/, drawn from the design system's icons at 2×. */
export type EmailIcon = 'lock' | 'calendar' | 'gift' | 'shield' | 'file';

export type EmailBlock =
  | { kind: 'code'; code: string; validity: string }
  | { kind: 'notice'; icon: EmailIcon; title: string; text: string }
  | { kind: 'facts'; rows: { label: string; value: string }[] }
  | { kind: 'paragraph'; text: string };

export type EmailParts = {
  /** The inbox preview line, hidden in the body. */
  preheader: string;
  /** public/email/<image>.png, 552 × 128, with its overline drawn in. */
  header: { image: string; alt: string };
  heading: string;
  intro: string;
  blocks: EmailBlock[];
  footnote: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** "381427" → "381 427", as the board shows the code. */
function spacedCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function image(base: string, name: string, width: number, height: number, alt: string): string {
  return `<img src="${base}/email/${name}.png" width="${width}" height="${height}" alt="${escapeHtml(alt)}" style="display:block;border:0;outline:none;">`;
}

function blockHtml(block: EmailBlock, base: string): string {
  if (block.kind === 'code') {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${COLOR.pandanSoft};border:1px solid ${COLOR.pandanLineOnSoft};border-radius:22px;"><tr><td align="center" style="padding:26px 24px 22px;"><div style="font-family:${DISPLAY_FONT};font-size:48px;line-height:52px;font-weight:800;letter-spacing:0.16em;color:${COLOR.pandan};white-space:nowrap;">${escapeHtml(spacedCode(block.code))}</div><div style="padding-top:10px;font-family:${TEXT_FONT};font-size:14px;line-height:20px;font-weight:600;color:${COLOR.inkMuted};"><img src="${base}/email/clock.png" width="16" height="16" alt="" style="display:inline-block;vertical-align:-3px;border:0;margin-right:6px;">${escapeHtml(block.validity)}</div></td></tr></table>`;
  }
  if (block.kind === 'notice') {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${COLOR.surface};border:1px solid ${COLOR.hairlineOnSurface};border-radius:18px;"><tr><td width="32" valign="top" style="padding:14px 0 14px 16px;">${image(base, block.icon, 32, 32, '')}</td><td valign="top" style="padding:16px 16px 14px 12px;font-family:${TEXT_FONT};"><div style="font-size:15px;line-height:20px;font-weight:600;color:${COLOR.ink};">${escapeHtml(block.title)}</div><div style="padding-top:2px;font-size:14px;line-height:20px;color:${COLOR.inkMuted};">${escapeHtml(block.text)}</div></td></tr></table>`;
  }
  if (block.kind === 'facts') {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${COLOR.surface};border:1px solid ${COLOR.hairlineOnSurface};border-radius:18px;">${block.rows
      .map(
        (row, index) =>
          `<tr><td style="padding:12px 16px;${index > 0 ? `border-top:1px solid ${COLOR.line};` : ''}font-family:${TEXT_FONT};"><div style="font-size:13px;line-height:18px;color:${COLOR.inkMuted};">${escapeHtml(row.label)}</div><div style="font-size:17px;line-height:22px;font-weight:600;color:${COLOR.ink};">${escapeHtml(row.value)}</div></td></tr>`,
      )
      .join('')}</table>`;
  }
  return `<p style="margin:0;font-family:${TEXT_FONT};font-size:15px;line-height:23px;color:${COLOR.inkMuted};">${escapeHtml(block.text)}</p>`;
}

function blockText(block: EmailBlock): string {
  if (block.kind === 'code') {
    return `${spacedCode(block.code)}\n${block.validity}`;
  }
  if (block.kind === 'notice') {
    return `${block.title}\n${block.text}`;
  }
  if (block.kind === 'facts') {
    return block.rows.map((row) => `${row.label}: ${row.value}`).join('\n');
  }
  return block.text;
}

/** Lib: renderEmail
 * The HTML and the plain-text body of one email, from its words and blocks.
 */
export function renderEmail(
  parts: EmailParts,
  base: string = env.PUBLIC_BASE_URL,
): { html: string; text: string } {
  const blocks = parts.blocks
    .map((block) => `<tr><td style="padding-top:22px;">${blockHtml(block, base)}</td></tr>`)
    .join('');
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(parts.heading)}</title></head><body style="margin:0;padding:0;background:${COLOR.surfaceMuted};"><div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(parts.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.surfaceMuted};"><tr><td align="center" style="padding:28px 24px 32px;"><table role="presentation" width="552" cellpadding="0" cellspacing="0" style="width:552px;max-width:100%;border-collapse:separate;background:${COLOR.surfaceRaised};border:1px solid ${COLOR.hairlineOnRaised};border-radius:28px;overflow:hidden;"><tr><td>${image(base, parts.header.image, 552, 128, parts.header.alt)}</td></tr><tr><td style="padding:36px 40px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><h1 style="margin:0;font-family:${DISPLAY_FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.025em;color:${COLOR.ink};">${escapeHtml(parts.heading)}</h1><p style="margin:10px 0 0;font-family:${TEXT_FONT};font-size:17px;line-height:26px;color:${COLOR.inkMuted};">${escapeHtml(parts.intro)}</p></td></tr>${blocks}</table></td></tr><tr><td style="padding:20px 40px 24px;border-top:1px solid ${COLOR.line};"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="28" valign="middle">${image(base, 'mark', 28, 28, 'Kira')}</td><td valign="middle" style="padding-left:14px;font-family:${TEXT_FONT};"><div style="font-size:14px;line-height:20px;font-weight:600;color:${COLOR.ink};">Kira · pendamping keuanganmu</div>${image(base, 'tagline', 184, 19, 'pelan-pelan, uangmu tumbuh')}</td></tr></table></td></tr></table><p style="margin:18px auto 0;max-width:520px;font-family:${TEXT_FONT};font-size:12px;line-height:18px;color:${COLOR.inkMuted};text-align:center;">${escapeHtml(parts.footnote)}</p></td></tr></table></body></html>`;
  const text = [
    parts.heading,
    parts.intro,
    ...parts.blocks.map(blockText),
    'Kira · pendamping keuanganmu\npelan-pelan, uangmu tumbuh',
    parts.footnote,
  ].join('\n\n');
  return { html, text };
}
