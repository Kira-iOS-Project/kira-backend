import { describe, expect, test } from 'bun:test';
import { LENDERS_AS_OF, LICENSED_LENDERS } from '../legality.data.ts';
import { LEGALITY_RESULT_LIMIT, normalized, searchLegality } from '../legality.service.ts';

describe('searchLegality', () => {
  test('finds a lender by its app, its company without PT, or its web address, whatever the case', () => {
    expect(searchLegality('kredit pintar').results.map((lender) => lender.app)).toEqual([
      'Kredit Pintar',
    ]);
    expect(searchLegality('PT Indo Fin Tek').results[0]?.app).toBe('Dompet Kilat');
    expect(searchLegality('https://p2p.danamas.co.id').results[0]?.company).toBe(
      'PT Pasar Dana Pinjaman',
    );
    expect(searchLegality('ADAKAMI').results[0]?.license).toBe('KEP-128/D.05/2019');
  });

  test('a name not in the list, or nothing searchable, answers no lender with the list it searched', () => {
    const none = searchLegality('Dana Kilat Express');
    expect(none.results).toEqual([]);
    expect(none.asOf).toBe(LENDERS_AS_OF);
    expect(none.listed).toBe(94);
    expect(searchLegality('PT · www').results).toEqual([]);
  });

  test('answers at most the limit, every word having to match', () => {
    expect(searchLegality('indonesia').results).toHaveLength(LEGALITY_RESULT_LIMIT);
    expect(searchLegality('dana syariah').results.map((lender) => lender.app)).toEqual([
      'DANA SYARIAH',
    ]);
  });

  test('the list is the 94 licensed lenders with a date and a web address each', () => {
    expect(LICENSED_LENDERS).toHaveLength(94);
    for (const lender of LICENSED_LENDERS) {
      expect(lender.licensedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(lender.website).toMatch(/^https?:\/\//);
    }
    expect(normalized('PT Kredit-Pintar  www')).toBe('kredit pintar');
  });
});
