import {
  parseAmount,
  splitExpense,
  SplitError,
  type CreateExpenseBody,
  type Share,
  type SplitBody,
} from "@tabby/core";

export type SplitType = SplitBody["type"];

export interface ExpenseFormState {
  description: string;
  amountText: string;
  paidBy: string;
  splitType: SplitType;
  /** Who takes part in the split. */
  included: Record<string, boolean>;
  /** Per-person text: dollars for exact, a whole number for shares, a percentage for percent. */
  values: Record<string, string>;
}

export type FormResult =
  | { ok: true; body: CreateExpenseBody; shares: Share[] }
  | { ok: false; error: string };

export function randomClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toSplit(form: ExpenseFormState, currency: string, ids: string[]): SplitBody | string {
  switch (form.splitType) {
    case "equal":
      return { type: "equal", memberIds: ids };
    case "exact": {
      const amounts: Record<string, number> = {};
      for (const id of ids) {
        const cents = parseAmount(form.values[id] || "0", currency);
        if (cents === null) return "Enter a valid amount for everyone in the split.";
        amounts[id] = cents;
      }
      return { type: "exact", amounts };
    }
    case "shares": {
      const shares: Record<string, number> = {};
      for (const id of ids) {
        const n = Number(form.values[id] || "1");
        if (!Number.isInteger(n) || n < 0) return "Shares must be whole numbers.";
        shares[id] = n;
      }
      return { type: "shares", shares };
    }
    case "percent": {
      const percents: Record<string, number> = {};
      for (const id of ids) {
        const n = Number(form.values[id] || "0");
        if (!Number.isFinite(n) || n < 0) return "Percentages must be numbers.";
        percents[id] = n;
      }
      return { type: "percent", percents };
    }
  }
}

/** Check the form and turn it into an API request, or explain what is wrong. */
export function buildExpenseBody(form: ExpenseFormState, currency: string, clientId = randomClientId()): FormResult {
  const description = form.description.trim();
  if (!description) return { ok: false, error: "Add a description." };
  const amount = parseAmount(form.amountText, currency);
  if (amount === null || amount <= 0) return { ok: false, error: "Enter an amount above zero, like 12.50." };
  if (!form.paidBy) return { ok: false, error: "Choose who paid." };
  const ids = Object.keys(form.included).filter((id) => form.included[id]);
  if (ids.length === 0) return { ok: false, error: "Pick at least one person to split with." };

  const split = toSplit(form, currency, ids);
  if (typeof split === "string") return { ok: false, error: split };
  try {
    const shares = splitExpense(amount, split);
    return { ok: true, body: { description, amount, paidBy: form.paidBy, split, clientId }, shares };
  } catch (err) {
    if (err instanceof SplitError) return { ok: false, error: err.message };
    throw err;
  }
}
