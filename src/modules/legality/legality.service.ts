import {
  LENDERS_AS_OF,
  LENDERS_SOURCE,
  LICENSED_LENDERS,
  type LicensedLender,
} from './legality.data.ts';

/** The most entries one search answers. */
export const LEGALITY_RESULT_LIMIT = 10;

export type LegalitySearch = {
  /** The last day the list covers. */
  asOf: string;
  source: string;
  /** How many licensed lenders the list holds. */
  listed: number;
  results: LicensedLender[];
};

/** Lower case, letters and digits only, single spaces; "PT", the web scheme and "www" dropped. */
export function normalized(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\//g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((word) => word && word !== 'pt' && word !== 'www')
    .join(' ');
}

/** Everything a person may type for a lender: its app, its company and its web address. */
function haystack(lender: LicensedLender): string {
  return [lender.app, lender.company, lender.website].map(normalized).join(' | ');
}

const indexed = LICENSED_LENDERS.map((lender) => ({ lender, text: haystack(lender) }));

/**
 * Cek Legalitas: the licensed lenders whose app, company or website holds every word of `query`
 * ("kredit pintar", "PT Indo Fin Tek", "danamas.co.id"). Kira decides nothing: an empty answer
 * means "not in this list", which the app words as such. The query is neither stored nor logged.
 */
export function searchLegality(query: string): LegalitySearch {
  const words = normalized(query).split(' ').filter(Boolean);
  const results =
    words.length === 0
      ? []
      : indexed
          .filter(({ text }) => words.every((word) => text.includes(word)))
          .map(({ lender }) => lender)
          .slice(0, LEGALITY_RESULT_LIMIT);
  return { asOf: LENDERS_AS_OF, source: LENDERS_SOURCE, listed: LICENSED_LENDERS.length, results };
}
