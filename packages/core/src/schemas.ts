import { z } from "zod";
import { MAX_CENTS } from "./money";

/** Request and response shapes shared by the API and the mobile client. */

const id = z.string().min(1).max(64);
const cents = z.number().int().positive().max(MAX_CENTS);
const name = z.string().trim().min(1).max(60);

export const splitSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("equal"), memberIds: z.array(id).min(1).max(50) }),
  z.object({ type: z.literal("exact"), amounts: z.record(id, z.number().int().min(0).max(MAX_CENTS)) }),
  z.object({ type: z.literal("shares"), shares: z.record(id, z.number().int().min(0).max(10_000)) }),
  z.object({ type: z.literal("percent"), percents: z.record(id, z.number().min(0).max(100)) }),
]);

// Requests
export const registerBody = z.object({ name });
export const createGroupBody = z.object({
  name,
  currency: z.string().length(3).transform((c) => c.toUpperCase()).default("CAD"),
});
export const addMemberBody = z.object({ name });
export const joinGroupBody = z.object({ code: z.string().min(4).max(16), memberId: id.optional() });
export const createExpenseBody = z.object({
  description: z.string().trim().min(1).max(120),
  amount: cents,
  paidBy: id,
  split: splitSchema,
  /** Client-generated id so a retried upload does not create a duplicate. */
  clientId: z.string().min(1).max(64).optional(),
});
export const createPaymentBody = z.object({ from: id, to: id, amount: cents });

// Responses
export const memberSchema = z.object({ id, name, claimed: z.boolean() });
export const groupSchema = z.object({
  id,
  name,
  currency: z.string(),
  joinCode: z.string(),
  members: z.array(memberSchema),
});
export const groupSummarySchema = groupSchema.pick({ id: true, name: true, currency: true });
export const expenseSchema = z.object({
  id,
  description: z.string(),
  amount: z.number().int(),
  paidBy: id,
  splitType: z.enum(["equal", "exact", "shares", "percent"]),
  splits: z.array(z.object({ memberId: id, amount: z.number().int() })),
  createdAt: z.string(),
});
export const paymentSchema = z.object({
  id,
  from: id,
  to: id,
  amount: z.number().int(),
  createdAt: z.string(),
});
export const balancesSchema = z.object({
  balances: z.array(z.object({ memberId: id, amount: z.number().int() })),
  transfers: z.array(z.object({ from: id, to: id, amount: z.number().int() })),
});
export const sessionSchema = z.object({
  user: z.object({ id, name }),
  token: z.string(),
});

export type SplitBody = z.infer<typeof splitSchema>;
export type RegisterBody = z.infer<typeof registerBody>;
export type CreateGroupBody = z.input<typeof createGroupBody>;
export type CreateExpenseBody = z.infer<typeof createExpenseBody>;
export type CreatePaymentBody = z.infer<typeof createPaymentBody>;
export type Member = z.infer<typeof memberSchema>;
export type Group = z.infer<typeof groupSchema>;
export type GroupSummary = z.infer<typeof groupSummarySchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type BalancesResponse = z.infer<typeof balancesSchema>;
export type Session = z.infer<typeof sessionSchema>;
