import { assertCents, type Cents } from "./money";

export type SplitInput =
  | { type: "equal"; memberIds: string[] }
  | { type: "exact"; amounts: Record<string, Cents> }
  | { type: "shares"; shares: Record<string, number> }
  | { type: "percent"; percents: Record<string, number> };

export interface Share {
  memberId: string;
  amount: Cents;
}

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitError";
  }
}

/**
 * Split `total` cents across weights using the largest remainder method.
 * Every share is floor(total * w / sum); the leftover cents go one at a time to the
 * entries with the biggest fractional remainder (ties go to the earlier entry).
 * The result always adds up to exactly `total`.
 */
export function allocate(total: Cents, weights: number[]): Cents[] {
  assertCents(total, "total");
  if (total < 0) throw new SplitError("total cannot be negative");
  if (weights.length === 0) throw new SplitError("nothing to split between");
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) throw new SplitError("weights must be whole numbers >= 0");
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new SplitError("at least one weight must be above zero");

  const t = BigInt(total);
  const s = BigInt(sum);
  const base = weights.map((w) => (t * BigInt(w)) / s);
  const remainders = weights.map((w, i) => ({
    i,
    rem: (t * BigInt(w)) % s,
  }));
  let leftover = Number(t - base.reduce((a, b) => a + b, 0n));
  remainders.sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  const result = base.map(Number);
  for (const { i } of remainders) {
    if (leftover === 0) break;
    // A zero weight never has a remainder, so it can never be picked before others.
    result[i] = (result[i] ?? 0) + 1;
    leftover -= 1;
  }
  return result;
}

function uniqueIds(ids: string[]): void {
  if (new Set(ids).size !== ids.length) throw new SplitError("a member appears twice in the split");
}

export function splitExpense(total: Cents, input: SplitInput): Share[] {
  assertCents(total, "total");
  if (total <= 0) throw new SplitError("expense total must be above zero");

  switch (input.type) {
    case "equal": {
      uniqueIds(input.memberIds);
      const amounts = allocate(total, input.memberIds.map(() => 1));
      return input.memberIds.map((memberId, i) => ({ memberId, amount: amounts[i] ?? 0 }));
    }
    case "shares": {
      const ids = Object.keys(input.shares);
      const amounts = allocate(total, ids.map((id) => input.shares[id] ?? 0));
      return ids.map((memberId, i) => ({ memberId, amount: amounts[i] ?? 0 }));
    }
    case "percent": {
      const ids = Object.keys(input.percents);
      // Percentages may have up to two decimals, so work in hundredths of a percent.
      const weights = ids.map((id) => Math.round((input.percents[id] ?? 0) * 100));
      if (weights.reduce((a, b) => a + b, 0) !== 10_000) {
        throw new SplitError("percentages must add up to 100");
      }
      const amounts = allocate(total, weights);
      return ids.map((memberId, i) => ({ memberId, amount: amounts[i] ?? 0 }));
    }
    case "exact": {
      const entries = Object.entries(input.amounts);
      if (entries.length === 0) throw new SplitError("nothing to split between");
      let sum = 0;
      for (const [, amount] of entries) {
        assertCents(amount);
        if (amount < 0) throw new SplitError("amounts cannot be negative");
        sum += amount;
      }
      if (sum !== total) {
        throw new SplitError(`amounts add up to ${sum} but the expense is ${total}`);
      }
      return entries.map(([memberId, amount]) => ({ memberId, amount }));
    }
  }
}
