/**
 * Counts text the way a person (and iOS's `String.count`) does: in extended grapheme clusters, so
 * an emoji with its skin tone or a family emoji is one character, not the UTF-16 units JavaScript's
 * `length` counts. A limit the app shows ("1000 karakter") then agrees with the API.
 */

const graphemes = new Intl.Segmenter('id', { granularity: 'grapheme' });

/** The number of characters a person sees in `text`. */
export function characterCount(text: string): number {
  let count = 0;
  for (const _ of graphemes.segment(text)) count += 1;
  return count;
}
