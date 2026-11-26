import { HttpError } from "../src/api/client";
import { createLocalClient, LOCAL_STATE_KEY, resetLocalState } from "../src/api/localClient";
import { memoryStorage } from "../src/lib/storage";

const make = (store = memoryStorage()) => ({ store, client: createLocalClient({ store, userName: "Me" }) });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("local data layer", () => {
  it("starts with one clearly fake group whose balances add to zero", async () => {
    const { client } = make();
    const groups = await client.listGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toMatch(/sample data/);
    const id = groups[0]!.id;
    const group = await client.getGroup(id);
    expect(group.members.every((m) => m.name.includes("(demo)"))).toBe(true);
    const { balances, transfers } = await client.getBalances(id);
    expect(sum(balances.map((b) => b.amount))).toBe(0);
    expect(transfers.length).toBeGreaterThan(0);
    const types = (await client.listExpenses(id)).map((e) => e.splitType).sort();
    expect(types).toEqual(["equal", "exact", "percent", "shares"]);
  });

  it("saves changes so a new client on the same storage sees them", async () => {
    const { store, client } = make();
    const g = await client.createGroup({ name: "Flat", currency: "cad" });
    expect(g.currency).toBe("CAD");
    expect(g.members.map((m) => m.name)).toEqual(["Me"]);
    const again = createLocalClient({ store, userName: "Me" });
    expect((await again.listGroups())[0]?.name).toBe("Flat");
    expect(await again.listGroups()).toHaveLength(2);
  });

  it("adds an equal expense with the odd cent and updates balances", async () => {
    const { client } = make();
    const g = await client.createGroup({ name: "Trio", currency: "CAD" });
    await client.addMember(g.id, "Sam");
    const withSam = await client.addMember(g.id, "Priya");
    const [me, sam, priya] = withSam.members.map((m) => m.id) as [string, string, string];
    const e = await client.createExpense(g.id, {
      description: "Groceries",
      amount: 10000,
      paidBy: me,
      split: { type: "equal", memberIds: [me, sam, priya] },
    });
    expect(e.splits.map((s) => s.amount)).toEqual([3334, 3333, 3333]);
    const { balances } = await client.getBalances(g.id);
    expect(balances.find((b) => b.memberId === me)?.amount).toBe(6666);
    expect(sum(balances.map((b) => b.amount))).toBe(0);
  });

  it("handles exact, shares and percent splits and rejects ones that do not add up", async () => {
    const { client } = make();
    const g = await client.createGroup({ name: "Pair", currency: "CAD" });
    const withB = await client.addMember(g.id, "B");
    const [a, b] = withB.members.map((m) => m.id) as [string, string];
    const base = { description: "x", amount: 1000, paidBy: a };
    expect((await client.createExpense(g.id, { ...base, split: { type: "shares", shares: { [a]: 1, [b]: 3 } } })).splits).toEqual([
      { memberId: a, amount: 250 },
      { memberId: b, amount: 750 },
    ]);
    await client.createExpense(g.id, { ...base, split: { type: "percent", percents: { [a]: 33.33, [b]: 66.67 } } });
    await client.createExpense(g.id, { ...base, split: { type: "exact", amounts: { [a]: 400, [b]: 600 } } });
    await expect(
      client.createExpense(g.id, { ...base, split: { type: "exact", amounts: { [a]: 400, [b]: 500 } } }),
    ).rejects.toBeInstanceOf(HttpError);
    await expect(
      client.createExpense(g.id, { ...base, split: { type: "percent", percents: { [a]: 50, [b]: 40 } } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await client.listExpenses(g.id)).toHaveLength(3);
  });

  it("rejects people who are not in the group, and bad input", async () => {
    const { client } = make();
    const g = await client.createGroup({ name: "Solo", currency: "CAD" });
    const me = g.members[0]!.id;
    await expect(
      client.createExpense(g.id, { description: "x", amount: 500, paidBy: "ghost", split: { type: "equal", memberIds: [me] } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      client.createExpense(g.id, { description: "", amount: 500, paidBy: me, split: { type: "equal", memberIds: [me] } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(client.getGroup("nope")).rejects.toMatchObject({ status: 404 });
    await expect(client.createPayment(g.id, { from: me, to: me, amount: 100 })).rejects.toMatchObject({ status: 400 });
  });

  it("does not save a second copy when the same clientId is sent twice", async () => {
    const { client } = make();
    const g = await client.createGroup({ name: "Solo", currency: "CAD" });
    const me = g.members[0]!.id;
    const body = { description: "Once", amount: 500, paidBy: me, split: { type: "equal" as const, memberIds: [me] }, clientId: "c1" };
    const first = await client.createExpense(g.id, body);
    const second = await client.createExpense(g.id, body);
    expect(second.id).toBe(first.id);
    expect(await client.listExpenses(g.id)).toHaveLength(1);
  });

  it("settling up with the suggested payments brings everyone to zero", async () => {
    const { client } = make();
    const id = (await client.listGroups())[0]!.id;
    const { transfers } = await client.getBalances(id);
    for (const t of transfers) await client.createPayment(id, t);
    const after = await client.getBalances(id);
    expect(after.balances.every((b) => b.amount === 0)).toBe(true);
    expect(after.transfers).toEqual([]);
    expect(await client.listPayments(id)).toHaveLength(transfers.length);
  });

  it("deletes an expense and keeps the others", async () => {
    const { client } = make();
    const id = (await client.listGroups())[0]!.id;
    const [first, ...rest] = await client.listExpenses(id);
    await client.deleteExpense(id, first!.id);
    expect((await client.listExpenses(id)).map((e) => e.id)).toEqual(rest.map((e) => e.id));
    await expect(client.deleteExpense(id, first!.id)).rejects.toMatchObject({ status: 404 });
  });

  it("handles quick overlapping calls without losing any", async () => {
    const { client } = make();
    const g = await client.createGroup({ name: "Race", currency: "CAD" });
    await Promise.all(["A", "B", "C", "D"].map((n) => client.addMember(g.id, n)));
    expect((await client.getGroup(g.id)).members).toHaveLength(5);
  });

  it("does not keep half of a failed change", async () => {
    const { store, client } = make();
    const g = await client.createGroup({ name: "Solo", currency: "CAD" });
    await client.addMember(g.id, "   ").catch(() => undefined);
    expect((await client.getGroup(g.id)).members).toHaveLength(1);
    expect(JSON.parse((await store.getItem(LOCAL_STATE_KEY)) ?? "{}").groups[0].members).toHaveLength(1);
  });

  it("returns copies, so earlier results do not change later", async () => {
    const { client } = make();
    const g = await client.createGroup({ name: "Copy", currency: "CAD" });
    await client.addMember(g.id, "New");
    expect(g.members).toHaveLength(1);
  });

  it("reset brings the sample group back", async () => {
    const { store, client } = make();
    await client.createGroup({ name: "Mine", currency: "CAD" });
    await resetLocalState(store);
    const fresh = createLocalClient({ store, userName: "Me" });
    const groups = await fresh.listGroups();
    expect(groups.map((x) => x.name)).toEqual([expect.stringMatching(/sample data/)]);
  });

  it("joins a group by its invite code", async () => {
    const { client } = make();
    expect((await client.joinGroup("demo1234")).name).toMatch(/sample data/);
    await expect(client.joinGroup("ZZZZZZZZ")).rejects.toMatchObject({ status: 404 });
  });
});
