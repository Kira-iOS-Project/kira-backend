/**
 * Text limits counted as a person counts them (`lib/text/characters.ts`): in characters (grapheme
 * clusters), with a bound on the UTF-16 units checked first so a long string is refused before it
 * is segmented.
 */

/**
 * The UTF-16 units one visible character may take, at most: no emoji sequence a keyboard types
 * needs more. A limit of N characters is also a limit of N × this many units, and of as many code
 * points (a code point is one or two units), which is what a database `char_length` check holds.
 */
export const MAX_UNITS_PER_CHARACTER = 16;
