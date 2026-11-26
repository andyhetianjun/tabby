import { buildApp } from "./app";
import { migrate, openPostgres, openSqlite } from "./db";

const databaseUrl = process.env.DATABASE_URL;
const db = databaseUrl ? openPostgres(databaseUrl) : openSqlite(process.env.SQLITE_PATH ?? "tabby.db");
await migrate(db);

const app = buildApp(db, { logger: true });
const port = Number(process.env.PORT ?? 3000);

const shutdown = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port, host: process.env.HOST ?? "0.0.0.0" });
console.log(`Using ${databaseUrl ? "Postgres" : "SQLite"}`);
