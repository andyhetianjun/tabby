import { splitExpense, type Expense, type SplitBody } from "@tabby/core";
import type { LocalState } from "./localClient";

/**
 * The group the demo starts with. Every name and amount here is made up.
 * It has one expense of each split type so the balances are interesting straight away.
 */
export function seedDemoState(now: Date): LocalState {
  const members = [
    { id: "demo-alex", name: "Alex (demo)", claimed: true },
    { id: "demo-bailey", name: "Bailey (demo)", claimed: false },
    { id: "demo-casey", name: "Casey (demo)", claimed: false },
    { id: "demo-dana", name: "Dana (demo)", claimed: false },
  ];
  const all = members.map((m) => m.id);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  const make = (id: string, description: string, amount: number, paidBy: string, split: SplitBody, days: number): Expense => ({
    id,
    description,
    amount,
    paidBy,
    splitType: split.type,
    splits: splitExpense(amount, split),
    createdAt: daysAgo(days),
  });

  // Newest first.
  const expenses: Expense[] = [
    make("demo-e4", "Boat rental", 18000, "demo-dana", { type: "percent", percents: { "demo-alex": 40, "demo-bailey": 30, "demo-casey": 30 } }, 1),
    make("demo-e3", "Gas", 6500, "demo-casey", { type: "shares", shares: { "demo-alex": 2, "demo-bailey": 1, "demo-casey": 2, "demo-dana": 1 } }, 2),
    make("demo-e2", "Groceries", 8420, "demo-bailey", { type: "exact", amounts: { "demo-alex": 2500, "demo-bailey": 2000, "demo-casey": 1920, "demo-dana": 2000 } }, 3),
    make("demo-e1", "Cabin rental", 41250, "demo-alex", { type: "equal", memberIds: all }, 4),
  ];

  return {
    groups: [
      {
        id: "demo-group",
        name: "Lake weekend (sample data)",
        currency: "CAD",
        joinCode: "DEMO1234",
        members,
        expenses,
        payments: [],
        clientIds: {},
      },
    ],
  };
}
