import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { splitReceipt, SplitError } from "../src";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("splitReceipt", () => {
  it("splits a small dinner by items", () => {
    const r = splitReceipt({
      items: [
        { name: "Pasta", amount: 1800, memberIds: ["a"] },
        { name: "Salad", amount: 1200, memberIds: ["b"] },
        { name: "Starter", amount: 1000, memberIds: ["a", "b"] },
      ],
      tax: 400,
      tip: 600,
    });
    // a: 1800 + 500 = 2300, b: 1200 + 500 = 1700, subtotal 4000
    expect(r.total).toBe(5000);
    const a = r.people.find((p) => p.memberId === "a");
    const b = r.people.find((p) => p.memberId === "b");
    expect(a).toEqual({ memberId: "a", items: 2300, tax: 230, tip: 345, total: 2875 });
    expect(b).toEqual({ memberId: "b", items: 1700, tax: 170, tip: 255, total: 2125 });
  });

  it("rotates the leftover cent between items", () => {
    const r = splitReceipt({
      items: [
        { name: "One", amount: 101, memberIds: ["a", "b"] },
        { name: "Two", amount: 101, memberIds: ["a", "b"] },
      ],
      tax: 0,
      tip: 0,
    });
    expect(r.people.map((p) => p.items)).toEqual([101, 101]);
  });

  it("shares tax in proportion, so a free item pays no tax", () => {
    const r = splitReceipt({
      items: [
        { name: "Water", amount: 0, memberIds: ["a"] },
        { name: "Steak", amount: 3000, memberIds: ["b"] },
      ],
      tax: 300,
      tip: 0,
    });
    expect(r.shares).toEqual([
      { memberId: "a", amount: 0 },
      { memberId: "b", amount: 3300 },
    ]);
  });

  it("rejects bad receipts", () => {
    expect(() => splitReceipt({ items: [], tax: 0, tip: 0 })).toThrow(SplitError);
    expect(() => splitReceipt({ items: [{ name: "x", amount: 100, memberIds: [] }], tax: 0, tip: 0 })).toThrow(/not assigned/);
    expect(() => splitReceipt({ items: [{ name: "x", amount: 100, memberIds: ["a", "a"] }], tax: 0, tip: 0 })).toThrow(/twice/);
    expect(() => splitReceipt({ items: [{ name: "x", amount: 100, memberIds: ["a"] }], tax: -1, tip: 0 })).toThrow(SplitError);
    expect(() => splitReceipt({ items: [{ name: "x", amount: 0, memberIds: ["a"] }], tax: 5, tip: 0 })).toThrow(SplitError);
  });
});

describe("splitReceipt properties", () => {
  const people = ["a", "b", "c", "d", "e"];
  const item = fc.record({
    name: fc.constant("item"),
    amount: fc.integer({ min: 0, max: 50_000 }),
    memberIds: fc.subarray(people, { minLength: 1 }).chain((ids) => fc.shuffledSubarray(ids, { minLength: ids.length, maxLength: ids.length })),
  });
  const receipt = fc.record({
    items: fc.array(item, { minLength: 1, maxLength: 15 }),
    tax: fc.integer({ min: 0, max: 20_000 }),
    tip: fc.integer({ min: 0, max: 20_000 }),
  });
  const usable = (r: { items: { amount: number }[]; tax: number; tip: number }) =>
    sum(r.items.map((i) => i.amount)) > 0 || r.tax + r.tip === 0;

  it("people's totals always add up to items + tax + tip", () => {
    fc.assert(
      fc.property(receipt, (r) => {
        fc.pre(usable(r));
        const out = splitReceipt(r);
        const expected = sum(r.items.map((i) => i.amount)) + r.tax + r.tip;
        expect(out.total).toBe(expected);
        expect(sum(out.shares.map((s) => s.amount))).toBe(expected);
        for (const p of out.people) expect(p.total).toBe(p.items + p.tax + p.tip);
        expect(sum(out.people.map((p) => p.items))).toBe(sum(r.items.map((i) => i.amount)));
        expect(sum(out.people.map((p) => p.tax))).toBe(r.tax);
        expect(sum(out.people.map((p) => p.tip))).toBe(r.tip);
      }),
      { numRuns: 300 },
    );
  });

  it("nobody is off their exact share by more than a cent per item plus a cent each for tax and tip", () => {
    fc.assert(
      fc.property(receipt, (r) => {
        fc.pre(usable(r));
        const out = splitReceipt(r);
        const exactItems = new Map<string, number>();
        for (const it of r.items) for (const id of it.memberIds) exactItems.set(id, (exactItems.get(id) ?? 0) + it.amount / it.memberIds.length);
        const subtotal = sum([...exactItems.values()]);
        for (const p of out.people) {
          const mine = exactItems.get(p.memberId) ?? 0;
          const exactTotal = mine + (subtotal === 0 ? 0 : ((r.tax + r.tip) * mine) / subtotal);
          expect(Math.abs(p.total - exactTotal)).toBeLessThanOrEqual(r.items.length + 2 + 1e-6);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("only people named on an item appear, and each pays at least their items", () => {
    fc.assert(
      fc.property(receipt, (r) => {
        fc.pre(usable(r));
        const named = new Set(r.items.flatMap((i) => i.memberIds));
        const out = splitReceipt(r);
        expect(new Set(out.people.map((p) => p.memberId))).toEqual(named);
        for (const p of out.people) expect(p.total).toBeGreaterThanOrEqual(p.items);
      }),
      { numRuns: 300 },
    );
  });
});
