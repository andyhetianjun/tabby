import { buildExpenseBody, type ExpenseFormState } from "../src/lib/expenseForm";

const base: ExpenseFormState = {
  description: "Groceries",
  amountText: "30.00",
  paidBy: "a",
  splitType: "equal",
  included: { a: true, b: true, c: true },
  values: {},
};

describe("buildExpenseBody", () => {
  it("builds an equal split in cents", () => {
    const r = buildExpenseBody(base, "CAD", "id1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body.amount).toBe(3000);
      expect(r.body.split).toEqual({ type: "equal", memberIds: ["a", "b", "c"] });
      expect(r.shares.map((s) => s.amount)).toEqual([1000, 1000, 1000]);
    }
  });

  it("only splits between people who are switched on", () => {
    const r = buildExpenseBody({ ...base, included: { a: true, b: false, c: true } }, "CAD");
    expect(r.ok && r.shares.map((s) => s.memberId)).toEqual(["a", "c"]);
  });

  it("explains missing fields", () => {
    expect(buildExpenseBody({ ...base, description: " " }, "CAD")).toEqual({ ok: false, error: "Add a description." });
    expect(buildExpenseBody({ ...base, amountText: "abc" }, "CAD").ok).toBe(false);
    expect(buildExpenseBody({ ...base, amountText: "0" }, "CAD").ok).toBe(false);
    expect(buildExpenseBody({ ...base, included: {} }, "CAD").ok).toBe(false);
  });

  it("checks exact amounts add up", () => {
    const form: ExpenseFormState = { ...base, splitType: "exact", values: { a: "10", b: "10", c: "5" } };
    const r = buildExpenseBody(form, "CAD");
    expect(r.ok).toBe(false);
    const fixed = buildExpenseBody({ ...form, values: { a: "10", b: "10", c: "10" } }, "CAD");
    expect(fixed.ok).toBe(true);
  });

  it("handles shares and percent", () => {
    const shares = buildExpenseBody({ ...base, splitType: "shares", values: { a: "2", b: "1", c: "1" }, amountText: "100" }, "CAD");
    expect(shares.ok && shares.shares.map((s) => s.amount)).toEqual([5000, 2500, 2500]);
    const pct = buildExpenseBody({ ...base, splitType: "percent", values: { a: "50", b: "30", c: "20" }, amountText: "100" }, "CAD");
    expect(pct.ok && pct.shares.map((s) => s.amount)).toEqual([5000, 3000, 2000]);
    const bad = buildExpenseBody({ ...base, splitType: "percent", values: { a: "50", b: "30", c: "10" } }, "CAD");
    expect(bad.ok).toBe(false);
  });
});
