/**
 * The values of a vocabulary object as the non-empty tuple Drizzle's `pgEnum` and Zod's `z.enum`
 * take, in declaration order, so a database enum and a request schema are built from the same home
 * (AGENTS.md Rule 43) instead of retyping its words.
 */
export function enumValues<T extends Record<string, string>>(
  vocabulary: T,
): [T[keyof T], ...T[keyof T][]] {
  const [first, ...rest] = Object.values(vocabulary) as T[keyof T][];
  if (first === undefined) throw new Error('A vocabulary needs at least one value');
  return [first, ...rest];
}
