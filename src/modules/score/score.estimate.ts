/**
 * What paying off one open account is worth now, for Detail Utang's "Perkiraan Kira Score 66 → 71":
 * the score with every open account, and with that one gone. A simulation; the official score
 * waits for the next payday.
 */

import type { DebtInput } from './score.engine.ts';
import { evaluate } from './score.measure.ts';
import { findScoreInput, type ScoreDeps } from './score.service.ts';

/** Whether two accounts read the same to the engine, so dropping either scores the same. */
function sameDebt(a: DebtInput, b: DebtInput): boolean {
  return (
    a.kind === b.kind &&
    a.name === b.name &&
    a.remaining === b.remaining &&
    a.monthlyInstalment === b.monthlyInstalment
  );
}

/** Null before the health check, or when `debt` is not among the open accounts. */
export async function estimatePayingOff(
  userId: string,
  debt: DebtInput,
  deps: Pick<ScoreDeps, 'repository'> = {},
): Promise<{ before: number; after: number } | null> {
  const input = await findScoreInput(userId, deps);
  if (!input) return null;
  const index = input.debts.findIndex((open) => sameDebt(open, debt));
  if (index === -1) return null;
  const rest = input.debts.filter((_, at) => at !== index);
  return { before: evaluate(input).score, after: evaluate({ ...input, debts: rest }).score };
}
