import { assertCents, type Cents } from "./money";
import { allocate, SplitError, type Share } from "./split";

export interface ReceiptItem {
  name: string;
  amount: Cents;
  /** Everyone who shared this item. It is divided evenly between them. */
  memberIds: string[];
}

export interface ReceiptInput {
  items: ReceiptItem[];
  tax: Cents;
  tip: Cents;
}

export interface PersonBreakdown {
  memberId: string;
  /** Their part of the items before tax and tip. */
  items: Cents;
  tax: Cents;
  tip: Cents;
  total: Cents;
}

export interface ReceiptSplit {
  /** Items + tax + tip. */
  total: Cents;
  people: PersonBreakdown[];
  /** The same totals as a normal expense split, ready to save as "exact amounts". */
  shares: Share[];
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Each person's items before rounding, scaled to whole numbers by the least common multiple
 * of the group sizes. Sharing tax and tip by these (instead of by the rounded cents) keeps a
 * single shared cent from tipping the whole tip onto one person. Returns null in the
 * unlikely case the numbers get too big for safe integers; the rounded amounts are used then.
 */
function exactWeights(items: ReceiptItem[], order: string[]): number[] | null {
  let scale = 1;
  for (const item of items) {
    const n = item.memberIds.length;
    scale = (scale / gcd(scale, n)) * n;
    if (!Number.isSafeInteger(scale)) return null;
  }
  const weights = new Map<string, number>();
  for (const item of items) {
    const each = item.amount * (scale / item.memberIds.length);
    for (const id of item.memberIds) weights.set(id, (weights.get(id) ?? 0) + each);
  }
  const result = order.map((id) => weights.get(id) ?? 0);
  const sum = result.reduce((a, b) => a + b, 0);
  return result.every(Number.isSafeInteger) && Number.isSafeInteger(sum) ? result : null;
}

/**
 * Split one receipt by items.
 *
 * - Each item is divided evenly between the people who shared it. When it does not divide
 *   evenly, the leftover cent goes to a different person for each item (the starting person
 *   rotates with the item's position), so nobody always ends up paying the extra cent.
 * - Tax and tip are each shared in proportion to what a person's items came to, using the
 *   same largest remainder method as the other split types. (Proportion is measured on the
 *   exact item shares, before they were rounded to cents.)
 *
 * The people's totals always add up to exactly items + tax + tip.
 */
export function splitReceipt(input: ReceiptInput): ReceiptSplit {
  const { items, tax, tip } = input;
  assertCents(tax, "tax");
  assertCents(tip, "tip");
  if (tax < 0 || tip < 0) throw new SplitError("tax and tip cannot be negative");
  if (items.length === 0) throw new SplitError("a receipt needs at least one item");

  const order: string[] = [];
  const itemTotals = new Map<string, Cents>();
  items.forEach((item, index) => {
    assertCents(item.amount, `item ${index + 1}`);
    if (item.amount < 0) throw new SplitError("item amounts cannot be negative");
    if (item.memberIds.length === 0) throw new SplitError(`"${item.name}" is not assigned to anyone`);
    if (new Set(item.memberIds).size !== item.memberIds.length) {
      throw new SplitError(`"${item.name}" lists the same person twice`);
    }
    const start = index % item.memberIds.length;
    const rotated = [...item.memberIds.slice(start), ...item.memberIds.slice(0, start)];
    const parts = allocate(item.amount, rotated.map(() => 1));
    rotated.forEach((memberId, i) => {
      if (!itemTotals.has(memberId)) order.push(memberId);
      itemTotals.set(memberId, (itemTotals.get(memberId) ?? 0) + (parts[i] ?? 0));
    });
  });

  const subtotals = order.map((id) => itemTotals.get(id) ?? 0);
  const subtotal = subtotals.reduce((a, b) => a + b, 0);
  const weights = exactWeights(items, order) ?? subtotals;
  if (subtotal === 0 && tax + tip > 0) {
    throw new SplitError("tax and tip need at least one item with a price to be shared by");
  }
  const taxParts = subtotal === 0 ? weights : allocate(tax, weights);
  const tipParts = subtotal === 0 ? weights : allocate(tip, weights);

  const people = order.map<PersonBreakdown>((memberId, i) => {
    const mine = subtotals[i] ?? 0;
    const t = subtotal === 0 ? 0 : (taxParts[i] ?? 0);
    const p = subtotal === 0 ? 0 : (tipParts[i] ?? 0);
    return { memberId, items: mine, tax: t, tip: p, total: mine + t + p };
  });
  return {
    total: subtotal + tax + tip,
    people,
    shares: people.map((p) => ({ memberId: p.memberId, amount: p.total })),
  };
}
