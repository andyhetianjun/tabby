import type { CreateExpenseBody } from "@tabby/core";
import { HttpError, NetworkError, type ApiClient } from "../api/client";
import type { KeyValueStore } from "./storage";

export interface PendingExpense {
  groupId: string;
  body: CreateExpenseBody;
}

const KEY = "outbox:expenses";

export async function readOutbox(store: KeyValueStore): Promise<PendingExpense[]> {
  const raw = await store.getItem(KEY).catch(() => null);
  return raw ? (JSON.parse(raw) as PendingExpense[]) : [];
}

const write = (store: KeyValueStore, items: PendingExpense[]) => store.setItem(KEY, JSON.stringify(items));

export async function enqueueExpense(store: KeyValueStore, item: PendingExpense): Promise<void> {
  const items = await readOutbox(store);
  await write(store, [...items, item]);
}

/**
 * Send queued expenses in order. Stops at the first network failure and keeps the rest.
 * An expense the server rejects (for example the group was deleted) is dropped so it cannot block the queue.
 * Each body carries a clientId, so a retry after a half-finished request never creates a duplicate.
 */
export async function flushOutbox(
  store: KeyValueStore,
  client: Pick<ApiClient, "createExpense">,
): Promise<{ sent: number; dropped: number; remaining: number }> {
  const items = await readOutbox(store);
  let sent = 0;
  let dropped = 0;
  let index = 0;
  for (; index < items.length; index++) {
    const item = items[index];
    if (!item) continue;
    try {
      await client.createExpense(item.groupId, item.body);
      sent++;
    } catch (err) {
      if (err instanceof NetworkError) break;
      if (err instanceof HttpError) {
        dropped++;
        continue;
      }
      throw err;
    }
  }
  const rest = items.slice(index);
  await write(store, rest);
  return { sent, dropped, remaining: rest.length };
}
