import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Db } from "./db";
import { ApiError } from "./errors";

export interface AuthUser {
  id: string;
  name: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Create a user and return the only copy of their token. We store just its hash. */
export async function createUser(db: Db, name: string) {
  const id = randomUUID();
  const token = randomBytes(24).toString("base64url");
  await db.batch([
    {
      sql: "INSERT INTO users (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)",
      params: [id, name, hash(token), new Date().toISOString()],
    },
  ]);
  return { user: { id, name }, token };
}

export function authenticate(db: Db) {
  return async (req: FastifyRequest): Promise<void> => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match?.[1]) throw new ApiError(401, "missing bearer token");
    const rows = await db.all<AuthUser>("SELECT id, name FROM users WHERE token_hash = ?", [hash(match[1])]);
    const user = rows[0];
    if (!user) throw new ApiError(401, "invalid token");
    req.user = user;
  };
}

export function currentUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw new ApiError(401, "not signed in");
  return req.user;
}
