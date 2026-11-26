import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allocate, splitExpense, SplitError } from "../src";

const sum = (xs: { amount: number }[]) => xs.reduce((a, b) => a + b.amount, 0);

describe("equal split", () => {
  it("divides evenly when it can", () => {
    expect(splitExpense(900, { type: "equal", memberIds: ["a", "b", "c"] })).toEqual([
      { memberId: "a", amount: 300 },
      { memberId: "b", amount: 300 },
      { memberId: "c", amount: 300 },
    ]);
  });
  it("hands leftover cents to the first members", () => {
    const out = splitExpense(1000, { type: "equal", memberIds: ["a", "b", "c"] });
    expect(out.map((s) => s.amount)).toEqual([334, 333, 333]);
  });
  it("one cent between three people", () => {
    const out = splitExpense(1, { type: "equal", memberIds: ["a", "b", "c"] });
    expect(out.map((s) => s.amount)).toEqual([1, 0, 0]);
  });
  it("rejects duplicates and empty lists", () => {
    expect(() => splitExpense(100, { type: "equal", memberIds: ["a", "a"] })).toThrow(SplitError);
    expect(() => splitExpense(100, { type: "equal", memberIds: [] })).toThrow(SplitError);
  });
});

describe("exact split", () => {
  it("accepts amounts that match the total", () => {
    const out = splitExpense(1000, { type: "exact", amounts: { a: 250, b: 750 } });
    expect(sum(out)).toBe(1000);
  });
  it("rejects amounts that do not match", () => {
    expect(() => splitExpense(1000, { type: "exact", amounts: { a: 250, b: 700 } })).toThrow(/add up/);
  });
});

describe("shares split", () => {
  it("splits by weight", () => {
    const out = splitExpense(1000, { type: "shares", shares: { a: 2, b: 1, c: 1 } });
    expect(out.map((s) => s.amount)).toEqual([500, 250, 250]);
  });
  it("gives the leftover cent to the biggest remainder", () => {
    // 100 cents in a 1:2 ratio is 33.33 and 66.67, so b gets the extra cent.
    const out = splitExpense(100, { type: "shares", shares: { a: 1, b: 2 } });
    expect(out.map((s) => s.amount)).toEqual([33, 67]);
  });
  it("lets someone have zero shares", () => {
    const out = splitExpense(100, { type: "shares", shares: { a: 1, b: 0 } });
    expect(out.map((s) => s.amount)).toEqual([100, 0]);
  });
  it("rejects all-zero shares", () => {
    expect(() => splitExpense(100, { type: "shares", shares: { a: 0 } })).toThrow(SplitError);
  });
});

describe("percent split", () => {
  it("splits by percentage", () => {
    const out = splitExpense(2000, { type: "percent", percents: { a: 50, b: 30, c: 20 } });
    expect(out.map((s) => s.amount)).toEqual([1000, 600, 400]);
  });
  it("handles thirds that do not divide evenly", () => {
    const out = splitExpense(100, { type: "percent", percents: { a: 33.33, b: 33.33, c: 33.34 } });
    expect(sum(out)).toBe(100);
    expect(out.map((s) => s.amount)).toEqual([33, 33, 34]);
  });
  it("requires 100 percent", () => {
    expect(() => splitExpense(100, { type: "percent", percents: { a: 50, b: 40 } })).toThrow(/100/);
  });
});

describe("validation", () => {
  it("rejects zero, negative and fractional totals", () => {
    const input = { type: "equal", memberIds: ["a"] } as const;
    expect(() => splitExpense(0, input)).toThrow();
    expect(() => splitExpense(-5, input)).toThrow();
    expect(() => splitExpense(1.5, input)).toThrow();
  });
});

describe("properties", () => {
  const total = fc.integer({ min: 1, max: 10_000_000_00 });

  it("allocate always adds up to the total and stays within one cent of the exact share", () => {
    fc.assert(
      fc.property(total, fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 }), (t, weights) => {
        fc.pre(weights.some((w) => w > 0));
        const out = allocate(t, weights);
        const wsum = weights.reduce((a, b) => a + b, 0);
        expect(out.reduce((a, b) => a + b, 0)).toBe(t);
        out.forEach((amount, i) => {
          const exact = (t * (weights[i] ?? 0)) / wsum;
          expect(Math.abs(amount - exact)).toBeLessThan(1);
          expect(amount).toBeGreaterThanOrEqual(0);
        });
      }),
    );
  });

  it("equal splits differ by at most one cent", () => {
    fc.assert(
      fc.property(total, fc.integer({ min: 1, max: 30 }), (t, n) => {
        const ids = Array.from({ length: n }, (_, i) => `m${i}`);
        const amounts = splitExpense(t, { type: "equal", memberIds: ids }).map((s) => s.amount);
        expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
        expect(amounts.reduce((a, b) => a + b, 0)).toBe(t);
      }),
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(total, fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 8 }), (t, w) => {
        expect(allocate(t, w)).toEqual(allocate(t, w));
      }),
    );
  });
});
