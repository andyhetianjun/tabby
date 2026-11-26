import {
  parseAmount,
  splitReceipt,
  SplitError,
  type CreateExpenseBody,
  type ReceiptSplit,
} from "@tabby/core";
import { randomClientId } from "./expenseForm";

export interface ReceiptItemForm {
  name: string;
  amountText: string;
  /** Member ids sharing this item. */
  memberIds: string[];
}

export interface ReceiptFormState {
  description: string;
  paidBy: string;
  items: ReceiptItemForm[];
  taxText: string;
  tipText: string;
}

export type ReceiptResult =
  | { ok: true; body: CreateExpenseBody; split: ReceiptSplit }
  | { ok: false; error: string };

/** Check the receipt form and turn it into an ordinary expense with exact amounts. */
export function buildReceiptExpense(form: ReceiptFormState, currency: string, clientId = randomClientId()): ReceiptResult {
  const description = form.description.trim();
  if (!description) return { ok: false, error: "Add a description." };
  if (!form.paidBy) return { ok: false, error: "Choose who paid." };
  if (form.items.length === 0) return { ok: false, error: "Add at least one item." };

  const items = [];
  for (const [i, item] of form.items.entries()) {
    const label = item.name.trim() || `Item ${i + 1}`;
    const amount = parseAmount(item.amountText, currency);
    if (amount === null) return { ok: false, error: `Enter a price for ${label}, like 12.50.` };
    items.push({ name: label, amount, memberIds: item.memberIds });
  }
  const tax = parseAmount(form.taxText || "0", currency);
  const tip = parseAmount(form.tipText || "0", currency);
  if (tax === null) return { ok: false, error: "Enter the tax as an amount, like 3.20." };
  if (tip === null) return { ok: false, error: "Enter the tip as an amount, like 5.00." };

  try {
    const split = splitReceipt({ items, tax, tip });
    if (split.total <= 0) return { ok: false, error: "The receipt total must be above zero." };
    const amounts = Object.fromEntries(split.shares.map((s) => [s.memberId, s.amount]));
    return {
      ok: true,
      split,
      body: { description, amount: split.total, paidBy: form.paidBy, split: { type: "exact", amounts }, clientId },
    };
  } catch (err) {
    if (err instanceof SplitError) return { ok: false, error: err.message };
    throw err;
  }
}
