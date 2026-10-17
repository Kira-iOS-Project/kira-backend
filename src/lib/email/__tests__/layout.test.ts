import { describe, expect, test } from 'bun:test';
import { escapeHtml, renderEmail, type EmailParts } from '../layout.ts';

const BASE = 'https://api.example.test';

function partsWith(overrides: Partial<EmailParts> = {}): EmailParts {
  return {
    preheader: 'Kode 381427 berlaku 10 menit.',
    header: { image: 'header-code', alt: 'Kira · Kode verifikasi' },
    heading: 'Ini Kode Masukmu',
    intro: 'Hai Dinda, masukkan kode di bawah ini.',
    blocks: [],
    footnote: 'Email ini dikirim ke dinda@email.com.',
    ...overrides,
  };
}

describe('escapeHtml', () => {
  test('escapes every character that could open markup or end an attribute', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });
});

describe('renderEmail', () => {
  test('lays the header image, the words and the footer out from the public base', () => {
    const { html, text } = renderEmail(partsWith(), BASE);

    expect(html).toContain(`src="${BASE}/email/header-code.png?v=2"`);
    expect(html).toContain('alt="Kira · Kode verifikasi"');
    expect(html).toContain('Ini Kode Masukmu');
    expect(html).toContain(`src="${BASE}/email/mark.png?v=2"`);
    expect(html).toContain(`src="${BASE}/email/tagline.png?v=2"`);
    expect(html).toContain('Kode 381427 berlaku 10 menit.');
    expect(text).toBe(
      'Ini Kode Masukmu\n\nHai Dinda, masukkan kode di bawah ini.\n\n' +
        'Kira · pendamping keuanganmu\npelan-pelan, uangmu tumbuh\n\n' +
        'Email ini dikirim ke dinda@email.com.',
    );
  });

  test('spaces the code as the board does and states how long it lasts', () => {
    const { html, text } = renderEmail(
      partsWith({ blocks: [{ kind: 'code', code: '381427', validity: 'Berlaku 10 menit' }] }),
      BASE,
    );

    expect(html).toContain('381 427');
    expect(html).not.toContain('clock.png');
    expect(text).toContain('381 427\nBerlaku 10 menit');
  });

  test('draws a notice with its title and text, and no icon image', () => {
    const { html, text } = renderEmail(
      partsWith({
        blocks: [
          {
            kind: 'notice',
            title: 'Jangan Bagikan Kode Ini',
            text: 'Kira tidak pernah meminta kode.',
          },
        ],
      }),
      BASE,
    );

    expect(html).not.toContain('lock.png');
    expect(text).toContain('Jangan Bagikan Kode Ini\nKira tidak pernah meminta kode.');
  });

  test('lists facts with a line between rows, and paragraphs as they are', () => {
    const { html, text } = renderEmail(
      partsWith({
        blocks: [
          {
            kind: 'facts',
            rows: [
              { label: 'Paket', value: 'Kira Plus' },
              { label: 'Diperpanjang', value: '15 November 2026' },
            ],
          },
          { kind: 'paragraph', text: 'Bukan kamu? Abaikan saja.' },
        ],
      }),
      BASE,
    );

    expect(html.match(/border-top:1px solid #e6e3dd;font-family/g)).toHaveLength(1);
    expect(text).toContain('Paket: Kira Plus\nDiperpanjang: 15 November 2026');
    expect(text).toContain('Bukan kamu? Abaikan saja.');
  });

  test('escapes the words it is given', () => {
    const { html } = renderEmail(partsWith({ heading: '<script>' }), BASE);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('defaults the asset base to the public base URL', () => {
    expect(renderEmail(partsWith()).html).toContain('/email/header-code.png');
  });
});
