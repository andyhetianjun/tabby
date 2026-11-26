import { randomUUID } from "node:crypto";
import {
  computeBalances,
  settleUp,
  splitExpense,
  SplitError,
  type BalancesResponse,
  type CreateExpenseBody,
  type CreatePaymentBody,
  type Expense,
  type Payment,
} from "@tabby/core";
import type { Db } from "./db";
import { badRequest, notFound } from "./errors";

async function memberIdsOf(db: Db, groupId: string): Promise<string[]> {
  const rows = await db.all<{ id: string }>("SELECT id FROM members WHERE group_id = ? ORDER BY created_at, id", [groupId]);
  return rows.map((r) => r.id);
}

function assertAllMembers(known: string[], ids: string[]) {
  const set = new Set(known);
  for (const id of ids) if (!set.has(id)) throw badRequest("member is not in this group");
}

/** Returns the expense and whether it was newly created (false when clientId was already used). */
export async function createExpense(db: Db, groupId: string, body: CreateExpenseBody) {
  const members = await memberIdsOf(db, groupId);
  const split = body.split;
  const splitIds =
    split.type === "equal" ? split.memberIds
    : split.type === "exact" ? Object.keys(split.amounts)
    : split.type === "shares" ? Object.keys(split.shares)
    : Object.keys(split.percents);
  assertAllMembers(members, [body.paidBy, ...splitIds]);

  if (body.clientId) {
    const dup = await db.all<{ id: string }>("SELECT id FROM expenses WHERE group_id = ? AND client_id = ?", [groupId, body.clientId]);
    if (dup[0]) return { expense: await getExpense(db, groupId, dup[0].id), created: false };
  }

  let shares;
  try {
    shares = splitExpense(body.amount, split);
  } catch (err) {
    if (err instanceof SplitError) throw badRequest(err.message);
    throw err;
  }

  const id = randomUUID();
  await db.batch([
    {
      sql: "INSERT INTO expenses (id, group_id, description, amount, paid_by, split_type, client_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      params: [id, groupId, body.description, body.amount, body.paidBy, split.type, body.clientId ?? null, new Date().toISOString()],
    },
    ...shares.map((s) => ({
      sql: "INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)",
      params: [id, s.memberId, s.amount],
    })),
  ]);
  return { expense: await getExpense(db, groupId, id), created: true };
}

interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  paid_by: string;
  split_type: Expense["splitType"];
  created_at: string;
}

async function loadExpenses(db: Db, groupId: string, onlyId?: string): Promise<Expense[]> {
  const rows = await db.all<ExpenseRow>(
    `SELECT id, description, amount, paid_by, split_type, created_at FROM expenses
     WHERE group_id = ? ${onlyId ? "AND id = ?" : ""} ORDER BY created_at DESC, id`,
    onlyId ? [groupId, onlyId] : [groupId],
  );
  const splits = await db.all<{ expense_id: string; member_id: string; amount: number }>(
    `SELECT s.expense_id, s.member_id, s.amount FROM expense_splits s
     JOIN expenses e ON e.id = s.expense_id WHERE e.group_id = ? ORDER BY s.member_id`,
    [groupId],
  );
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    amount: r.amount,
    paidBy: r.paid_by,
    splitType: r.split_type,
    createdAt: r.created_at,
    splits: splits.filter((s) => s.expense_id === r.id).map((s) => ({ memberId: s.member_id, amount: s.amount })),
  }));
}

export const listExpenses = (db: Db, groupId: string) => loadExpenses(db, groupId);

export async function getExpense(db: Db, groupId: string, id: string): Promise<Expense> {
  const found = (await loadExpenses(db, groupId, id))[0];
  if (!found) throw notFound("expense not found");
  return found;
}

export async function deleteExpense(db: Db, groupId: string, id: string) {
  await getExpense(db, groupId, id);
  await db.batch([
    { sql: "DELETE FROM expense_splits WHERE expense_id = ?", params: [id] },
    { sql: "DELETE FROM expenses WHERE id = ? AND group_id = ?", params: [id, groupId] },
  ]);
}

export async function createPayment(db: Db, groupId: string, body: CreatePaymentBody): Promise<Payment> {
  if (body.from === body.to) throw badRequest("cannot pay yourself");
  assertAllMembers(await memberIdsOf(db, groupId), [body.from, body.to]);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await db.batch([
    {
      sql: "INSERT INTO payments (id, group_id, from_member, to_member, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      params: [id, groupId, body.from, body.to, body.amount, createdAt],
    },
  ]);
  return { id, from: body.from, to: body.to, amount: body.amount, createdAt };
}

export async function listPayments(db: Db, groupId: string): Promise<Payment[]> {
  const rows = await db.all<{ id: string; from_member: string; to_member: string; amount: number; created_at: string }>(
    "SELECT id, from_member, to_member, amount, created_at FROM payments WHERE group_id = ? ORDER BY created_at DESC, id",
    [groupId],
  );
  return rows.map((r) => ({ id: r.id, from: r.from_member, to: r.to_member, amount: r.amount, createdAt: r.created_at }));
}

export async function balancesFor(db: Db, groupId: string): Promise<BalancesResponse> {
  const [members, expenses, payments] = await Promise.all([
    memberIdsOf(db, groupId),
    listExpenses(db, groupId),
    listPayments(db, groupId),
  ]);
  const balances = computeBalances(
    members,
    expenses.map((e) => ({ paidBy: e.paidBy, amount: e.amount, splits: e.splits })),
    payments,
  );
  return { balances, transfers: settleUp(balances) };
}
