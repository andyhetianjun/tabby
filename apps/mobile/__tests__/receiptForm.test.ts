import { createExpenseBody } from "@tabby/core";
import { buildReceiptExpense, type ReceiptFormState } from "../src/lib/receiptForm";

const form = (patch: Partial<ReceiptFormState> = {}): ReceiptFormState => ({
  description: "Dinner",
  paidBy: "a",
  items: [
    { name: "Pasta", amountText: "18.00", memberIds: ["a"] },
    { name: "Salad", amountText: "12.00", memberIds: ["b"] },
    { name: "Starter", amountText: "10.00", memberIds: ["a", "b"] },
  ],
  taxText: "4.00",
  tipText: "6.00",
  ...patch,
});

describe("buildReceiptExpense", () => {
  it("makes an exact-amounts expense that matches the receipt total", () => {
    const r = buildReceiptExpense(form(), "CAD", "id1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.amount).toBe(5000);
    expect(r.body.split).toEqual({ type: "exact", amounts: { a: 2875, b: 2125 } });
    expect(createExpenseBody.safeParse(r.body).success).toBe(true);
  });

  it("explains what is wrong", () => {
    const err = (f: ReceiptFormState) => {
      const r = buildReceiptExpense(f, "CAD");
      return r.ok ? null : r.error;
    };
    expect(err(form({ description: " " }))).toMatch(/description/);
    expect(err(form({ items: [] }))).toMatch(/at least one item/);
    expect(err(form({ items: [{ name: "Tea", amountText: "abc", memberIds: ["a"] }] }))).toMatch(/price for Tea/);
    expect(err(form({ items: [{ name: "Tea", amountText: "3.00", memberIds: [] }] }))).toMatch(/not assigned/);
    expect(err(form({ taxText: "x" }))).toMatch(/tax/);
    expect(err(form({ tipText: "1.234" }))).toMatch(/tip/);
  });
});
