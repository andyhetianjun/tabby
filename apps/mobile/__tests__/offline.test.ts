import { HttpError, NetworkError } from "../src/api/client";
import { cachedGet } from "../src/lib/cache";
import { enqueueExpense, flushOutbox, readOutbox } from "../src/lib/outbox";
import { memoryStorage } from "../src/lib/storage";

describe("cachedGet", () => {
  it("returns fresh data and saves it", async () => {
    const store = memoryStorage();
    const fresh = await cachedGet(store, "k", async () => ({ n: 1 }));
    expect(fresh).toEqual({ data: { n: 1 }, fromCache: false });
    const offline = await cachedGet(store, "k", async () => {
      throw new NetworkError();
    });
    expect(offline).toEqual({ data: { n: 1 }, fromCache: true });
  });

  it("fails when offline with nothing saved", async () => {
    await expect(
      cachedGet(memoryStorage(), "k", async () => {
        throw new NetworkError();
      }),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it("does not hide server errors behind old data", async () => {
    const store = memoryStorage();
    await cachedGet(store, "k", async () => 1);
    await expect(
      cachedGet(store, "k", async () => {
        throw new HttpError(404, "group not found");
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });
});

describe("outbox", () => {
  const body = (clientId: string) => ({
    description: "x",
    amount: 100,
    paidBy: "a",
    clientId,
    split: { type: "equal" as const, memberIds: ["a"] },
  });

  it("sends queued expenses in order and empties the queue", async () => {
    const store = memoryStorage();
    await enqueueExpense(store, { groupId: "g", body: body("1") });
    await enqueueExpense(store, { groupId: "g", body: body("2") });
    const sent: string[] = [];
    const client = { createExpense: jest.fn(async (_g: string, b: { clientId?: string }) => { sent.push(b.clientId ?? ""); return {} as never; }) };
    expect(await flushOutbox(store, client)).toEqual({ sent: 2, dropped: 0, remaining: 0 });
    expect(sent).toEqual(["1", "2"]);
    expect(await readOutbox(store)).toEqual([]);
  });

  it("keeps the rest when the network drops", async () => {
    const store = memoryStorage();
    for (const id of ["1", "2", "3"]) await enqueueExpense(store, { groupId: "g", body: body(id) });
    let calls = 0;
    const client = {
      createExpense: jest.fn(async () => {
        if (++calls === 2) throw new NetworkError();
        return {} as never;
      }),
    };
    expect(await flushOutbox(store, client)).toEqual({ sent: 1, dropped: 0, remaining: 2 });
    expect((await readOutbox(store)).map((i) => i.body.clientId)).toEqual(["2", "3"]);
  });

  it("drops an expense the server rejects", async () => {
    const store = memoryStorage();
    await enqueueExpense(store, { groupId: "gone", body: body("1") });
    const client = { createExpense: jest.fn(async () => { throw new HttpError(404, "group not found"); }) };
    expect(await flushOutbox(store, client)).toEqual({ sent: 0, dropped: 1, remaining: 0 });
  });
});
