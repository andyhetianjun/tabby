import cors from "@fastify/cors";
import {
  addMemberBody,
  createExpenseBody,
  createGroupBody,
  createPaymentBody,
  joinGroupBody,
  registerBody,
} from "@tabby/core";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { authenticate, createUser, currentUser } from "./auth";
import type { Db } from "./db";
import { ApiError } from "./errors";
import { balancesFor, createExpense, createPayment, deleteExpense, listExpenses, listPayments } from "./expenses";
import { addMember, createGroup, joinGroup, listGroupsFor, loadGroup, requireMembership } from "./groups";

interface GroupParams {
  Params: { groupId: string };
}

export function buildApp(db: Db, opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });
  void app.register(cors, { origin: true });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: "invalid request", issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
    if (err instanceof ApiError) return reply.status(err.status).send({ error: err.message });
    app.log.error(err);
    return reply.status(500).send({ error: "something went wrong" });
  });

  app.get("/health", async () => ({ ok: true }));

  app.post("/auth/register", async (req, reply) => {
    const { name } = registerBody.parse(req.body);
    return reply.status(201).send(await createUser(db, name));
  });

  // Everything below needs a token.
  app.register(async (authed) => {
    authed.addHook("preHandler", authenticate(db));

    authed.get("/me", async (req) => currentUser(req));

    authed.get("/groups", async (req) => listGroupsFor(db, currentUser(req).id));

    authed.post("/groups", async (req, reply) => {
      const body = createGroupBody.parse(req.body);
      return reply.status(201).send(await createGroup(db, currentUser(req), body.name, body.currency));
    });

    authed.post("/groups/join", async (req) => {
      const body = joinGroupBody.parse(req.body);
      return joinGroup(db, currentUser(req), body.code, body.memberId);
    });

    authed.get<GroupParams>("/groups/:groupId", async (req) => {
      await requireMembership(db, req.params.groupId, currentUser(req).id);
      return loadGroup(db, req.params.groupId);
    });

    authed.post<GroupParams>("/groups/:groupId/members", async (req, reply) => {
      await requireMembership(db, req.params.groupId, currentUser(req).id);
      const { name } = addMemberBody.parse(req.body);
      await addMember(db, req.params.groupId, name);
      return reply.status(201).send(await loadGroup(db, req.params.groupId));
    });

    authed.get<GroupParams>("/groups/:groupId/expenses", async (req) => {
      await requireMembership(db, req.params.groupId, currentUser(req).id);
      return listExpenses(db, req.params.groupId);
    });

    authed.post<GroupParams>("/groups/:groupId/expenses", async (req, reply) => {
      await requireMembership(db, req.params.groupId, currentUser(req).id);
      const body = createExpenseBody.parse(req.body);
      const { expense, created } = await createExpense(db, req.params.groupId, body);
      return reply.status(created ? 201 : 200).send(expense);
    });

    authed.delete<{ Params: { groupId: string; expenseId: string } }>("/groups/:groupId/expenses/:expenseId", async (req, reply) => {
      await requireMembership(db, req.params.groupId, currentUser(req).id);
      await deleteExpense(db, req.params.groupId, req.params.expenseId);
      return reply.status(204).send();
    });

    authed.get<GroupParams>("/groups/:groupId/balances", async (req) => {
      await requireMembership(db, req.params.groupId, currentUser(req).id);
      return balancesFor(db, req.params.groupId);
    });

    authed.get<GroupParams>("/groups/:groupId/payments", async (req) => {
      await requireMembership(db, req.params.groupId, currentUser(req).id);
      return listPayments(db, req.params.groupId);
    });

    authed.post<GroupParams>("/groups/:groupId/payments", async (req, reply) => {
      await requireMembership(db, req.params.groupId, currentUser(req).id);
      const body = createPaymentBody.parse(req.body);
      return reply.status(201).send(await createPayment(db, req.params.groupId, body));
    });
  });

  return app;
}
