import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BalancesResponse, Expense, Group } from "@tabby/core";
import { call, makeApp, register } from "./helpers";

type Ctx = Awaited<ReturnType<typeof makeApp>>;
let ctx: Ctx;
beforeEach(async () => { ctx = await makeApp(); });
afterEach(async () => { await ctx.close(); });

async function setup() {
  const ann = await register(ctx.app, "Ann");
  const g = await call<Group>(ctx.app, ann.token, "POST", "/groups", { name: "Apartment", currency: "cad" });
  const group = g.body;
  await call(ctx.app, ann.token, "POST", `/groups/${group.id}/members`, { name: "Ben" });
  const full = (await call<Group>(ctx.app, ann.token, "POST", `/groups/${group.id}/members`, { name: "Cat" })).body;
  // Members added in the same millisecond can come back in any order, so look them up by name.
  const id = (name: string) => full.members.find((m) => m.name === name)!.id;
  const [a, b, c] = [id("Ann"), id("Ben"), id("Cat")];
  return { ann, group: full, a, b, c };
}

describe("auth", () => {
  it("registers and returns a token that works", async () => {
    const { user, token } = await register(ctx.app, "Ann");
    expect(user.name).toBe("Ann");
    const me = await call(ctx.app, token, "GET", "/me");
    expect(me.status).toBe(200);
    expect(me.body).toEqual(user);
  });
  it("rejects missing and wrong tokens", async () => {
    expect((await ctx.app.inject({ url: "/groups" })).statusCode).toBe(401);
    expect((await call(ctx.app, "nope", "GET", "/groups")).status).toBe(401);
  });
  it("validates the name", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/auth/register", payload: { name: "" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("groups", () => {
  it("creates a group with the creator as the first member", async () => {
    const ann = await register(ctx.app, "Ann");
    const res = await call<Group>(ctx.app, ann.token, "POST", "/groups", { name: "Trip", currency: "usd" });
    expect(res.status).toBe(201);
    expect(res.body.currency).toBe("USD");
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0]).toMatchObject({ name: "Ann", claimed: true });
    const list = await call<{ id: string }[]>(ctx.app, ann.token, "GET", "/groups");
    expect(list.body.map((g) => g.id)).toEqual([res.body.id]);
  });
  it("hides groups from non-members", async () => {
    const { group } = await setup();
    const eve = await register(ctx.app, "Eve");
    expect((await call(ctx.app, eve.token, "GET", `/groups/${group.id}`)).status).toBe(404);
    expect((await call(ctx.app, eve.token, "GET", `/groups/${group.id}/balances`)).status).toBe(404);
    expect((await call(ctx.app, eve.token, "GET", "/groups")).body).toEqual([]);
  });
  it("lets someone join by code and claim a name", async () => {
    const { group, b } = await setup();
    const ben = await register(ctx.app, "Benjamin");
    const joined = await call<Group>(ctx.app, ben.token, "POST", "/groups/join", { code: group.joinCode.toLowerCase(), memberId: b });
    expect(joined.status).toBe(200);
    expect(joined.body.members.find((m) => m.id === b)?.claimed).toBe(true);
    expect((await call(ctx.app, ben.token, "GET", `/groups/${group.id}`)).status).toBe(200);
    // The name is taken now.
    const eve = await register(ctx.app, "Eve");
    expect((await call(ctx.app, eve.token, "POST", "/groups/join", { code: group.joinCode, memberId: b })).status).toBe(404);
  });
  it("joins as a new member when no name is claimed", async () => {
    const { group } = await setup();
    const dan = await register(ctx.app, "Dan");
    const joined = await call<Group>(ctx.app, dan.token, "POST", "/groups/join", { code: group.joinCode });
    expect(joined.body.members.map((m) => m.name)).toContain("Dan");
    // Joining twice does not add a second member.
    const again = await call<Group>(ctx.app, dan.token, "POST", "/groups/join", { code: group.joinCode });
    expect(again.body.members).toHaveLength(joined.body.members.length);
  });
  it("rejects a bad invite code", async () => {
    const ann = await register(ctx.app, "Ann");
    expect((await call(ctx.app, ann.token, "POST", "/groups/join", { code: "ZZZZZZZZ" })).status).toBe(404);
  });
});

describe("expenses, balances and settle-up", () => {
  it("splits equally and leaves the odd cent with the first member", async () => {
    const { ann, group, a, b, c } = await setup();
    const res = await call<Expense>(ctx.app, ann.token, "POST", `/groups/${group.id}/expenses`, {
      description: "Groceries", amount: 1000, paidBy: a, split: { type: "equal", memberIds: [a, b, c] },
    });
    expect(res.status).toBe(201);
    expect(res.body.splits.reduce((s, x) => s + x.amount, 0)).toBe(1000);
    const bal = await call<BalancesResponse>(ctx.app, ann.token, "GET", `/groups/${group.id}/balances`);
    const byId = Object.fromEntries(bal.body.balances.map((x) => [x.memberId, x.amount]));
    expect(byId).toEqual({ [a]: 666, [b]: -333, [c]: -333 });
    expect(bal.body.transfers).toHaveLength(2);
  });

  it("supports exact, shares and percent splits", async () => {
    const { ann, group, a, b, c } = await setup();
    const url = `/groups/${group.id}/expenses`;
    const exact = await call<Expense>(ctx.app, ann.token, "POST", url, {
      description: "Dinner", amount: 5000, paidBy: b, split: { type: "exact", amounts: { [a]: 2000, [b]: 1500, [c]: 1500 } },
    });
    expect(exact.status).toBe(201);
    const shares = await call<Expense>(ctx.app, ann.token, "POST", url, {
      description: "Rent", amount: 100000, paidBy: a, split: { type: "shares", shares: { [a]: 2, [b]: 1, [c]: 1 } },
    });
    expect(shares.body.splits.map((s) => s.amount).sort((x, y) => x - y)).toEqual([25000, 25000, 50000]);
    const pct = await call<Expense>(ctx.app, ann.token, "POST", url, {
      description: "Gas", amount: 100, paidBy: c, split: { type: "percent", percents: { [a]: 33.33, [b]: 33.33, [c]: 33.34 } },
    });
    expect(pct.body.splits.reduce((s, x) => s + x.amount, 0)).toBe(100);
    const bal = await call<BalancesResponse>(ctx.app, ann.token, "GET", `/groups/${group.id}/balances`);
    expect(bal.body.balances.reduce((s, x) => s + x.amount, 0)).toBe(0);
  });

  it("rejects bad splits and outside members", async () => {
    const { ann, group, a, b } = await setup();
    const url = `/groups/${group.id}/expenses`;
    const mismatch = await call(ctx.app, ann.token, "POST", url, {
      description: "x", amount: 1000, paidBy: a, split: { type: "exact", amounts: { [a]: 1, [b]: 2 } },
    });
    expect(mismatch.status).toBe(400);
    const stranger = await call(ctx.app, ann.token, "POST", url, {
      description: "x", amount: 1000, paidBy: "not-a-member", split: { type: "equal", memberIds: [a] },
    });
    expect(stranger.status).toBe(400);
    const floaty = await call(ctx.app, ann.token, "POST", url, {
      description: "x", amount: 10.5, paidBy: a, split: { type: "equal", memberIds: [a] },
    });
    expect(floaty.status).toBe(400);
    expect((await call<Expense[]>(ctx.app, ann.token, "GET", url)).body).toEqual([]);
  });

  it("ignores a repeated clientId", async () => {
    const { ann, group, a } = await setup();
    const url = `/groups/${group.id}/expenses`;
    const payload = { description: "Coffee", amount: 450, paidBy: a, clientId: "abc", split: { type: "equal", memberIds: [a] } };
    const first = await call<Expense>(ctx.app, ann.token, "POST", url, payload);
    const second = await call<Expense>(ctx.app, ann.token, "POST", url, payload);
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.body.id).toBe(first.body.id);
    expect((await call<Expense[]>(ctx.app, ann.token, "GET", url)).body).toHaveLength(1);
  });

  it("deletes an expense", async () => {
    const { ann, group, a, b } = await setup();
    const url = `/groups/${group.id}/expenses`;
    const e = await call<Expense>(ctx.app, ann.token, "POST", url, {
      description: "Oops", amount: 800, paidBy: a, split: { type: "equal", memberIds: [a, b] },
    });
    expect((await call(ctx.app, ann.token, "DELETE", `${url}/${e.body.id}`)).status).toBe(204);
    expect((await call(ctx.app, ann.token, "DELETE", `${url}/${e.body.id}`)).status).toBe(404);
    const bal = await call<BalancesResponse>(ctx.app, ann.token, "GET", `/groups/${group.id}/balances`);
    expect(bal.body.balances.every((x) => x.amount === 0)).toBe(true);
  });

  it("records a payment and clears the debt", async () => {
    const { ann, group, a, b } = await setup();
    await call(ctx.app, ann.token, "POST", `/groups/${group.id}/expenses`, {
      description: "Pizza", amount: 2000, paidBy: a, split: { type: "equal", memberIds: [a, b] },
    });
    const before = await call<BalancesResponse>(ctx.app, ann.token, "GET", `/groups/${group.id}/balances`);
    expect(before.body.transfers).toEqual([{ from: b, to: a, amount: 1000 }]);
    const pay = await call(ctx.app, ann.token, "POST", `/groups/${group.id}/payments`, { from: b, to: a, amount: 1000 });
    expect(pay.status).toBe(201);
    const after = await call<BalancesResponse>(ctx.app, ann.token, "GET", `/groups/${group.id}/balances`);
    expect(after.body.transfers).toEqual([]);
    expect(after.body.balances.every((x) => x.amount === 0)).toBe(true);
  });

  it("rejects paying yourself", async () => {
    const { ann, group, a } = await setup();
    const res = await call(ctx.app, ann.token, "POST", `/groups/${group.id}/payments`, { from: a, to: a, amount: 100 });
    expect(res.status).toBe(400);
  });

  it("does not let another group's member use this group", async () => {
    const { group, a } = await setup();
    const eve = await register(ctx.app, "Eve");
    const res = await call(ctx.app, eve.token, "POST", `/groups/${group.id}/expenses`, {
      description: "x", amount: 100, paidBy: a, split: { type: "equal", memberIds: [a] },
    });
    expect(res.status).toBe(404);
  });
});
