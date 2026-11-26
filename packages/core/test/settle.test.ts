import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeBalances, settleUp, splitExpense, type ExpenseRecord, type PaymentRecord } from "../src";

const members = ["ann", "ben", "cat"];

describe("computeBalances", () => {
  it("credits the payer and debits the split", () => {
    const splits = splitExpense(3000, { type: "equal", memberIds: members });
    const out = computeBalances(members, [{ paidBy: "ann", amount: 3000, splits }]);
    expect(out).toEqual([
      { memberId: "ann", amount: 2000 },
      { memberId: "ben", amount: -1000 },
      { memberId: "cat", amount: -1000 },
    ]);
  });
  it("applies recorded payments", () => {
    const splits = splitExpense(3000, { type: "equal", memberIds: members });
    const expenses: ExpenseRecord[] = [{ paidBy: "ann", amount: 3000, splits }];
    const payments: PaymentRecord[] = [{ from: "ben", to: "ann", amount: 1000 }];
    const out = computeBalances(members, expenses, payments);
    expect(out.find((b) => b.memberId === "ben")?.amount).toBe(0);
    expect(out.find((b) => b.memberId === "ann")?.amount).toBe(1000);
  });
  it("rejects unknown members and bad splits", () => {
    expect(() => computeBalances(["a"], [{ paidBy: "x", amount: 5, splits: [{ memberId: "a", amount: 5 }] }])).toThrow();
    expect(() => computeBalances(["a"], [{ paidBy: "a", amount: 5, splits: [{ memberId: "a", amount: 4 }] }])).toThrow();
  });
});

describe("settleUp", () => {
  it("returns nothing when everyone is square", () => {
    expect(settleUp([{ memberId: "a", amount: 0 }])).toEqual([]);
  });
  it("uses one transfer for a simple debt", () => {
    expect(settleUp([{ memberId: "a", amount: 500 }, { memberId: "b", amount: -500 }])).toEqual([
      { from: "b", to: "a", amount: 500 },
    ]);
  });
  it("collapses a chain into fewer transfers", () => {
    // a owes b 10, b owes c 10: one transfer a -> c is enough.
    const out = settleUp([
      { memberId: "a", amount: -1000 },
      { memberId: "b", amount: 0 },
      { memberId: "c", amount: 1000 },
    ]);
    expect(out).toEqual([{ from: "a", to: "c", amount: 1000 }]);
  });
  it("splits one big debtor across several creditors", () => {
    const out = settleUp([
      { memberId: "a", amount: 300 },
      { memberId: "b", amount: 200 },
      { memberId: "c", amount: -500 },
    ]);
    expect(out).toHaveLength(2);
  });
  it("throws if balances do not add up to zero", () => {
    expect(() => settleUp([{ memberId: "a", amount: 5 }])).toThrow(/zero/);
  });
});

describe("properties", () => {
  const idArb = fc.constantFrom("a", "b", "c", "d", "e", "f");
  const expenseArb = fc.record({
    paidBy: idArb,
    amount: fc.integer({ min: 1, max: 5_000_00 }),
    ids: fc.uniqueArray(idArb, { minLength: 1, maxLength: 6 }),
  });
  const all = ["a", "b", "c", "d", "e", "f"];

  const build = (raw: { paidBy: string; amount: number; ids: string[] }[]): ExpenseRecord[] =>
    raw.map((e) => ({
      paidBy: e.paidBy,
      amount: e.amount,
      splits: splitExpense(e.amount, { type: "equal", memberIds: e.ids }),
    }));

  it("balances always sum to zero", () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 25 }), (raw) => {
        const balances = computeBalances(all, build(raw));
        expect(balances.reduce((s, b) => s + b.amount, 0)).toBe(0);
      }),
    );
  });

  it("settling clears every balance using at most n-1 transfers", () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 25 }), (raw) => {
        const balances = computeBalances(all, build(raw));
        const transfers = settleUp(balances);
        const open = balances.filter((b) => b.amount !== 0).length;
        expect(transfers.length).toBeLessThanOrEqual(Math.max(0, open - 1));
        for (const t of transfers) expect(t.amount).toBeGreaterThan(0);
        const net = new Map(balances.map((b) => [b.memberId, b.amount]));
        for (const t of transfers) {
          net.set(t.from, (net.get(t.from) ?? 0) + t.amount);
          net.set(t.to, (net.get(t.to) ?? 0) - t.amount);
        }
        expect([...net.values()].every((v) => v === 0)).toBe(true);
      }),
    );
  });

  it("settle-up payments recorded as payments bring balances to zero", () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 25 }), (raw) => {
        const expenses = build(raw);
        const transfers = settleUp(computeBalances(all, expenses));
        const final = computeBalances(all, expenses, transfers);
        expect(final.every((b) => b.amount === 0)).toBe(true);
      }),
    );
  });
});
