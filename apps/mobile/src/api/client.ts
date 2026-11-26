import {
  balancesSchema,
  expenseSchema,
  groupSchema,
  groupSummarySchema,
  paymentSchema,
  sessionSchema,
  type BalancesResponse,
  type CreateExpenseBody,
  type CreateGroupBody,
  type CreatePaymentBody,
  type Expense,
  type Group,
  type GroupSummary,
  type Payment,
  type Session,
} from "@tabby/core";
import { z } from "zod";

/** The server could not be reached (offline, wrong address, server down). */
export class NetworkError extends Error {
  constructor(message = "Cannot reach the server") {
    super(message);
    this.name = "NetworkError";
  }
}

/** The server answered with an error status. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface ClientOptions {
  baseUrl: string;
  token?: string | null;
  fetchImpl?: typeof fetch;
}

export function createClient({ baseUrl, token, fetchImpl = fetch }: ClientOptions) {
  const root = baseUrl.replace(/\/+$/, "");

  async function request<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(root + path, {
        method,
        headers: {
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new NetworkError();
    }
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string; issues?: string[] } | null;
      throw new HttpError(res.status, payload?.issues?.join(", ") ?? payload?.error ?? `Request failed (${res.status})`);
    }
    if (res.status === 204) return schema.parse(undefined);
    return schema.parse(await res.json());
  }

  return {
    register: (name: string): Promise<Session> => request("POST", "/auth/register", sessionSchema, { name }),
    listGroups: (): Promise<GroupSummary[]> => request("GET", "/groups", z.array(groupSummarySchema)),
    createGroup: (body: CreateGroupBody): Promise<Group> => request("POST", "/groups", groupSchema, body),
    joinGroup: (code: string, memberId?: string): Promise<Group> =>
      request("POST", "/groups/join", groupSchema, { code, memberId }),
    getGroup: (id: string): Promise<Group> => request("GET", `/groups/${id}`, groupSchema),
    addMember: (id: string, name: string): Promise<Group> =>
      request("POST", `/groups/${id}/members`, groupSchema, { name }),
    listExpenses: (id: string): Promise<Expense[]> => request("GET", `/groups/${id}/expenses`, z.array(expenseSchema)),
    createExpense: (id: string, body: CreateExpenseBody): Promise<Expense> =>
      request("POST", `/groups/${id}/expenses`, expenseSchema, body),
    deleteExpense: (id: string, expenseId: string): Promise<void> =>
      request("DELETE", `/groups/${id}/expenses/${expenseId}`, z.undefined()),
    getBalances: (id: string): Promise<BalancesResponse> => request("GET", `/groups/${id}/balances`, balancesSchema),
    listPayments: (id: string): Promise<Payment[]> => request("GET", `/groups/${id}/payments`, z.array(paymentSchema)),
    createPayment: (id: string, body: CreatePaymentBody): Promise<Payment> =>
      request("POST", `/groups/${id}/payments`, paymentSchema, body),
  };
}

export type ApiClient = ReturnType<typeof createClient>;
