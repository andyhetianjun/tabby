import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { migrate, openPostgres, openSqlite } from "../src/db";

/** SQLite in memory by default. Set TEST_DATABASE_URL to run the same tests against Postgres. */
export async function makeApp() {
  const url = process.env.TEST_DATABASE_URL;
  const db = url ? openPostgres(url) : openSqlite(":memory:");
  await migrate(db);
  if (url) {
    await db.batch(
      ["payments", "expense_splits", "expenses", "members", "groups", "users"].map((t) => ({ sql: `DELETE FROM ${t}` })),
    );
  }
  const app = buildApp(db);
  await app.ready();
  return { app, close: async () => { await app.close(); await db.close(); } };
}

export async function register(app: FastifyInstance, name: string) {
  const res = await app.inject({ method: "POST", url: "/auth/register", payload: { name } });
  return res.json() as { user: { id: string; name: string }; token: string };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

export async function call<T = unknown>(
  app: FastifyInstance,
  token: string,
  method: "GET" | "POST" | "DELETE",
  url: string,
  payload?: unknown,
) {
  const res = await app.inject({ method, url, headers: auth(token), payload: payload as object | undefined });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
}
