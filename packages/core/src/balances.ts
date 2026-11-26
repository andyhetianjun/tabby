import { assertCents, type Cents } from "./money";
import type { Share } from "./split";

export interface ExpenseRecord {
  paidBy: string;
  amount: Cents;
  splits: Share[];
}

/** `from` handed `amount` to `to` outside the app (cash, e-transfer...). */
export interface PaymentRecord {
  from: string;
  to: string;
  amount: Cents;
}

export interface Balance {
  memberId: string;
  /** Positive: the group owes this member. Negative: this member owes the group. */
  amount: Cents;
}

/**
 * Net position of every member. The payer of an expense is credited the full amount
 * and each person in the split is debited their share, so the balances always add up to zero.
 */
export function computeBalances(
  memberIds: string[],
  expenses: ExpenseRecord[],
  payments: PaymentRecord[] = [],
): Balance[] {
  const net = new Map<string, Cents>(memberIds.map((id) => [id, 0]));
  const add = (id: string, delta: Cents) => {
    const current = net.get(id);
    if (current === undefined) throw new Error(`unknown member ${id}`);
    net.set(id, current + delta);
  };

  for (const e of expenses) {
    assertCents(e.amount);
    const splitTotal = e.splits.reduce((sum, s) => sum + s.amount, 0);
    if (splitTotal !== e.amount) throw new Error("expense splits do not add up to the amount");
    add(e.paidBy, e.amount);
    for (const s of e.splits) add(s.memberId, -s.amount);
  }
  for (const p of payments) {
    assertCents(p.amount);
    add(p.from, p.amount);
    add(p.to, -p.amount);
  }
  return memberIds.map((memberId) => ({ memberId, amount: net.get(memberId) ?? 0 }));
}
