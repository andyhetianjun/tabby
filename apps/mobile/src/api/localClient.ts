import {
  computeBalances,
  createExpenseBody,
  createGroupBody,
  createPaymentBody,
  settleUp,
  splitExpense,
  SplitError,
  type CreateExpenseBody,
  type Expense,
  type Group,
  type Payment,
} from "@tabby/core";
import type { KeyValueStore } from "../lib/storage";
import { HttpError, type ApiClient } from "./client";
import { seedDemoState } from "./demoSeed";

/**
 * A stand-in for the server that keeps everything in the phone's own storage.
 * It exposes the same methods as the real client and runs the same core code
 * (splitting, balances, settle-up), so the screens cannot tell the difference.
 */

export interface StoredGroup {
  id: string;
  name: string;
  currency: string;
  joinCode: string;
  members: { id: string; name: string; claimed: boolean }[];
  expenses: Expense[];
  payments: Payment[];
  /** Used to remember which clientIds were already saved, so a retry does not duplicate. */
  clientIds: Record<string, string>;
}

export interface LocalState {
  /** Newest first, like the server's list. */
  groups: StoredGroup[];
}

export const LOCAL_STATE_KEY = "local:state";

let counter = 0;
export function localId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 6)}`;
}

const joinCode = () => Math.random().toString(16).slice(2, 10).toUpperCase().padEnd(8, "0");

function summary(g: StoredGroup): Group {
  return { id: g.id, name: g.name, currency: g.currency, joinCode: g.joinCode, members: g.members };
}

export interface LocalClientOptions {
  store: KeyValueStore;
  /** Name for the member created when the user makes a new group. */
  userName: string;
  /** Fill an empty store with the fake demo group the first time. Default true. */
  seed?: boolean;
  now?: () => Date;
}

export function createLocalClient({ store, userName, seed = true, now = () => new Date() }: LocalClientOptions): ApiClient {
  let cache: LocalState | null = null;
  // Calls run one at a time so two quick taps cannot overwrite each other.
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<LocalState> {
    if (cache) return cache;
    const raw = await store.getItem(LOCAL_STATE_KEY).catch(() => null);
    if (raw) {
      try {
        cache = JSON.parse(raw) as LocalState;
        return cache;
      } catch {
        // A damaged copy is replaced below.
      }
    }
    cache = seed ? seedDemoState(now()) : { groups: [] };
    await store.setItem(LOCAL_STATE_KEY, JSON.stringify(cache));
    return cache;
  }

  /** Run `fn`; if it changes the state, save it. A failed call leaves the saved copy untouched. */
  function run<T>(fn: (state: LocalState) => T | Promise<T>, write = false): Promise<T> {
    const next = queue.then(async () => {
      const state = await load();
      const before = write ? JSON.stringify(state) : "";
      try {
        const result = await fn(state);
        if (write) await store.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
        // Hand back a copy so a screen holding old data never sees it change underneath it.
        return (result === undefined ? result : JSON.parse(JSON.stringify(result))) as T;
      } catch (err) {
        if (write) cache = JSON.parse(before) as LocalState;
        throw err;
      }
    });
    queue = next.catch(() => undefined);
    return next;
  }

  const find = (state: LocalState, id: string): StoredGroup => {
    const g = state.groups.find((x) => x.id === id);
    if (!g) throw new HttpError(404, "group not found");
    return g;
  };

  const validate = <T>(parse: () => T): T => {
    try {
      return parse();
    } catch (err) {
      const issues = (err as { issues?: { message: string }[] }).issues;
      throw new HttpError(400, issues?.map((i) => i.message).join(", ") ?? "invalid request");
    }
  };

  const assertMembers = (g: StoredGroup, ids: string[]) => {
    const known = new Set(g.members.map((m) => m.id));
    if (ids.some((id) => !known.has(id))) throw new HttpError(400, "member is not in this group");
  };

  const balancesOf = (g: StoredGroup) => {
    const balances = computeBalances(
      g.members.map((m) => m.id),
      g.expenses.map((e) => ({ paidBy: e.paidBy, amount: e.amount, splits: e.splits })),
      g.payments,
    );
    return { balances, transfers: settleUp(balances) };
  };

  return {
    register: async (name) => ({ user: { id: "local-user", name }, token: "local" }),

    listGroups: () => run((s) => s.groups.map(({ id, name, currency }) => ({ id, name, currency }))),

    createGroup: (body: Parameters<ApiClient["createGroup"]>[0]) =>
      run((s) => {
        const parsed = validate(() => createGroupBody.parse(body));
        const g: StoredGroup = {
          id: localId("group"),
          name: parsed.name,
          currency: parsed.currency,
          joinCode: joinCode(),
          members: [{ id: localId("member"), name: userName, claimed: true }],
          expenses: [],
          payments: [],
          clientIds: {},
        };
        s.groups.unshift(g);
        return summary(g);
      }, true),

    joinGroup: (code) =>
      run((s) => {
        const g = s.groups.find((x) => x.joinCode === code.toUpperCase());
        if (!g) throw new HttpError(404, "invalid invite code");
        return summary(g);
      }),

    getGroup: (id) => run((s) => summary(find(s, id))),

    addMember: (id, name) =>
      run((s) => {
        const g = find(s, id);
        const clean = name.trim();
        if (!clean || clean.length > 60) throw new HttpError(400, "name must be 1 to 60 characters");
        g.members.push({ id: localId("member"), name: clean, claimed: false });
        return summary(g);
      }, true),

    listExpenses: (id) => run((s) => [...find(s, id).expenses]),

    createExpense: (id, body: CreateExpenseBody) =>
      run((s) => {
        const g = find(s, id);
        const parsed = validate(() => createExpenseBody.parse(body));
        const split = parsed.split;
        const splitIds =
          split.type === "equal" ? split.memberIds
          : split.type === "exact" ? Object.keys(split.amounts)
          : split.type === "shares" ? Object.keys(split.shares)
          : Object.keys(split.percents);
        assertMembers(g, [parsed.paidBy, ...splitIds]);

        const existing = parsed.clientId ? g.clientIds[parsed.clientId] : undefined;
        const dup = existing ? g.expenses.find((e) => e.id === existing) : undefined;
        if (dup) return dup;

        let shares;
        try {
          shares = splitExpense(parsed.amount, split);
        } catch (err) {
          if (err instanceof SplitError) throw new HttpError(400, err.message);
          throw err;
        }
        const expense: Expense = {
          id: localId("expense"),
          description: parsed.description,
          amount: parsed.amount,
          paidBy: parsed.paidBy,
          splitType: split.type,
          splits: shares,
          createdAt: now().toISOString(),
        };
        g.expenses.unshift(expense);
        if (parsed.clientId) g.clientIds[parsed.clientId] = expense.id;
        return expense;
      }, true),

    deleteExpense: (id, expenseId) =>
      run((s) => {
        const g = find(s, id);
        if (!g.expenses.some((e) => e.id === expenseId)) throw new HttpError(404, "expense not found");
        g.expenses = g.expenses.filter((e) => e.id !== expenseId);
      }, true),

    getBalances: (id) => run((s) => balancesOf(find(s, id))),

    listPayments: (id) => run((s) => [...find(s, id).payments]),

    createPayment: (id, body) =>
      run((s) => {
        const g = find(s, id);
        const parsed = validate(() => createPaymentBody.parse(body));
        if (parsed.from === parsed.to) throw new HttpError(400, "cannot pay yourself");
        assertMembers(g, [parsed.from, parsed.to]);
        const payment: Payment = { id: localId("payment"), ...parsed, createdAt: now().toISOString() };
        g.payments.unshift(payment);
        return payment;
      }, true),
  };
}

/** Throw away everything the demo saved, so the next start begins from the fake group again. */
export async function resetLocalState(store: KeyValueStore): Promise<void> {
  await store.removeItem(LOCAL_STATE_KEY);
}
