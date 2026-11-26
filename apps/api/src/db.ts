import Database from "better-sqlite3";
import pg from "pg";

/**
 * A tiny database interface with two implementations, SQLite and Postgres.
 * All SQL in this project is written with `?` placeholders and sticks to the common subset,
 * so the same statements run on both.
 */
export interface Statement {
  sql: string;
  params?: unknown[];
}

export interface Db {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run several statements atomically (all or nothing). */
  batch(statements: Statement[]): Promise<void>;
  close(): Promise<void>;
}

export function openSqlite(path = ":memory:"): Db {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  if (path !== ":memory:") db.pragma("journal_mode = WAL");
  return {
    async all<T>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      return (stmt.reader ? stmt.all(...params) : (stmt.run(...params), [])) as T[];
    },
    async batch(statements) {
      db.transaction(() => {
        for (const s of statements) db.prepare(s.sql).run(...(s.params ?? []));
      })();
    },
    async close() {
      db.close();
    },
  };
}

const toPgPlaceholders = (sql: string) => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};

export function openPostgres(connectionString: string): Db {
  // BIGINT (oid 20) comes back as a string by default. Our amounts are far below 2^53.
  pg.types.setTypeParser(20, (v) => Number(v));
  const pool = new pg.Pool({ connectionString });
  return {
    async all<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(toPgPlaceholders(sql), params);
      return res.rows as T[];
    },
    async batch(statements) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const s of statements) await client.query(toPgPlaceholders(s.sql), s.params ?? []);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     token_hash TEXT NOT NULL UNIQUE,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS groups (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     currency TEXT NOT NULL,
     join_code TEXT NOT NULL UNIQUE,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS members (
     id TEXT PRIMARY KEY,
     group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     user_id TEXT REFERENCES users(id),
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS expenses (
     id TEXT PRIMARY KEY,
     group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     description TEXT NOT NULL,
     amount BIGINT NOT NULL,
     paid_by TEXT NOT NULL REFERENCES members(id),
     split_type TEXT NOT NULL,
     client_id TEXT,
     created_at TEXT NOT NULL,
     UNIQUE (group_id, client_id)
   )`,
  `CREATE TABLE IF NOT EXISTS expense_splits (
     expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
     member_id TEXT NOT NULL REFERENCES members(id),
     amount BIGINT NOT NULL,
     PRIMARY KEY (expense_id, member_id)
   )`,
  `CREATE TABLE IF NOT EXISTS payments (
     id TEXT PRIMARY KEY,
     group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     from_member TEXT NOT NULL REFERENCES members(id),
     to_member TEXT NOT NULL REFERENCES members(id),
     amount BIGINT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS members_group ON members (group_id)`,
  `CREATE INDEX IF NOT EXISTS expenses_group ON expenses (group_id)`,
  `CREATE INDEX IF NOT EXISTS payments_group ON payments (group_id)`,
];

export async function migrate(db: Db): Promise<void> {
  await db.batch(SCHEMA.map((sql) => ({ sql })));
}
