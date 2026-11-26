import type { Balance } from "./balances";
import type { Cents } from "./money";

export interface Transfer {
  from: string;
  to: string;
  amount: Cents;
}

/**
 * Turn balances into a short list of payments that settles everyone.
 *
 * Step 1 pairs up a debtor and a creditor with exactly equal amounts (one transfer clears both).
 * Step 2 is greedy: the biggest debtor pays the biggest creditor until one of them is clear.
 *
 * This never needs more than (people with a non-zero balance - 1) transfers. Finding the true
 * minimum is a subset-sum style problem, so the greedy result can occasionally be one
 * transfer longer than the best possible answer.
 */
export function settleUp(balances: Balance[]): Transfer[] {
  const total = balances.reduce((sum, b) => sum + b.amount, 0);
  if (total !== 0) throw new Error(`balances must add up to zero, got ${total}`);

  const creditors = balances.filter((b) => b.amount > 0).map((b) => ({ id: b.memberId, left: b.amount }));
  const debtors = balances.filter((b) => b.amount < 0).map((b) => ({ id: b.memberId, left: -b.amount }));
  const transfers: Transfer[] = [];

  // Step 1: exact matches.
  for (const d of debtors) {
    const match = creditors.find((c) => c.left > 0 && c.left === d.left);
    if (d.left > 0 && match) {
      transfers.push({ from: d.id, to: match.id, amount: d.left });
      match.left = 0;
      d.left = 0;
    }
  }

  // Step 2: greedy on what remains.
  const biggest = (list: { id: string; left: number }[]) =>
    list.reduce<{ id: string; left: number } | undefined>(
      (best, x) => (x.left > 0 && (!best || x.left > best.left) ? x : best),
      undefined,
    );
  for (;;) {
    const d = biggest(debtors);
    const c = biggest(creditors);
    if (!d || !c) break;
    const amount = Math.min(d.left, c.left);
    transfers.push({ from: d.id, to: c.id, amount });
    d.left -= amount;
    c.left -= amount;
  }
  return transfers;
}
