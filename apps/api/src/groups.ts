import { randomBytes, randomUUID } from "node:crypto";
import type { Group } from "@tabby/core";
import type { Db } from "./db";
import { notFound } from "./errors";

interface GroupRow {
  id: string;
  name: string;
  currency: string;
  join_code: string;
}
interface MemberRow {
  id: string;
  name: string;
  user_id: string | null;
}

const newJoinCode = () => randomBytes(4).toString("hex").toUpperCase();

export async function createGroup(db: Db, user: { id: string; name: string }, name: string, currency: string) {
  const id = randomUUID();
  const memberId = randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    { sql: "INSERT INTO groups (id, name, currency, join_code, created_at) VALUES (?, ?, ?, ?, ?)", params: [id, name, currency, newJoinCode(), now] },
    { sql: "INSERT INTO members (id, group_id, name, user_id, created_at) VALUES (?, ?, ?, ?, ?)", params: [memberId, id, user.name, user.id, now] },
  ]);
  return loadGroup(db, id);
}

export async function loadGroup(db: Db, groupId: string): Promise<Group> {
  const group = (await db.all<GroupRow>("SELECT id, name, currency, join_code FROM groups WHERE id = ?", [groupId]))[0];
  if (!group) throw notFound("group not found");
  const members = await db.all<MemberRow>(
    "SELECT id, name, user_id FROM members WHERE group_id = ? ORDER BY created_at, id",
    [groupId],
  );
  return {
    id: group.id,
    name: group.name,
    currency: group.currency,
    joinCode: group.join_code,
    members: members.map((m) => ({ id: m.id, name: m.name, claimed: m.user_id !== null })),
  };
}

export async function listGroupsFor(db: Db, userId: string) {
  return db.all<{ id: string; name: string; currency: string }>(
    `SELECT g.id, g.name, g.currency FROM groups g
     JOIN members m ON m.group_id = g.id
     WHERE m.user_id = ? ORDER BY g.created_at DESC, g.id`,
    [userId],
  );
}

/** Returns the caller's member row, or throws 404 so outsiders cannot tell a group exists. */
export async function requireMembership(db: Db, groupId: string, userId: string) {
  const rows = await db.all<{ id: string }>("SELECT id FROM members WHERE group_id = ? AND user_id = ?", [groupId, userId]);
  const row = rows[0];
  if (!row) throw notFound("group not found");
  return row;
}

export async function addMember(db: Db, groupId: string, name: string) {
  await db.batch([
    { sql: "INSERT INTO members (id, group_id, name, user_id, created_at) VALUES (?, ?, ?, NULL, ?)", params: [randomUUID(), groupId, name, new Date().toISOString()] },
  ]);
}

/** Join with an invite code, either as a new member or by claiming a name someone already added. */
export async function joinGroup(db: Db, user: { id: string; name: string }, code: string, memberId?: string) {
  const group = (await db.all<{ id: string }>("SELECT id FROM groups WHERE join_code = ?", [code.toUpperCase()]))[0];
  if (!group) throw notFound("invalid invite code");
  const existing = await db.all<{ id: string }>("SELECT id FROM members WHERE group_id = ? AND user_id = ?", [group.id, user.id]);
  if (existing.length === 0) {
    if (memberId) {
      const target = (await db.all<{ user_id: string | null }>("SELECT user_id FROM members WHERE id = ? AND group_id = ?", [memberId, group.id]))[0];
      if (!target) throw notFound("member not found");
      if (target.user_id !== null) throw notFound("that member is already taken");
      await db.batch([{ sql: "UPDATE members SET user_id = ? WHERE id = ?", params: [user.id, memberId] }]);
    } else {
      await db.batch([
        { sql: "INSERT INTO members (id, group_id, name, user_id, created_at) VALUES (?, ?, ?, ?, ?)", params: [randomUUID(), group.id, user.name, user.id, new Date().toISOString()] },
      ]);
    }
  }
  return loadGroup(db, group.id);
}
