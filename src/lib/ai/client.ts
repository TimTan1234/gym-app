import "server-only";
import OpenAI from "openai";
import { db } from "@/lib/db";

let client: OpenAI | null = null;

export function isAiMock(): boolean {
  return process.env.AI_MOCK === "1" || !process.env.OPENAI_API_KEY;
}

export function openai(): OpenAI {
  // OPENAI_BASE_URL lets any OpenAI-compatible Responses API be used (e.g. DeepSeek).
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
  return client;
}

export const models = {
  /** Fast, vision-capable model for meal analysis. */
  fast: () => process.env.OPENAI_MODEL || "gpt-5.4-mini",
  /** Stronger model for coaching. */
  smart: () => process.env.OPENAI_SMART_MODEL || process.env.OPENAI_MODEL || "gpt-5.5",
  /** Plan generation: long structured output, so a fast model may be preferable. */
  plan: () => process.env.OPENAI_PLAN_MODEL || models.smart(),
};

const EFFORTS = ["minimal", "low", "medium", "high"] as const;

/**
 * Optional reasoning effort for the smart model (OPENAI_REASONING_EFFORT).
 * "low" roughly halves latency on reasoning models like deepseek-v4-pro.
 */
export function reasoningOptions(): { reasoning?: { effort: (typeof EFFORTS)[number] } } {
  const effort = process.env.OPENAI_REASONING_EFFORT as (typeof EFFORTS)[number] | undefined;
  return effort && EFFORTS.includes(effort) ? { reasoning: { effort } } : {};
}

export type AiKind = "MEAL" | "PLAN" | "CHAT";

const DEFAULT_LIMITS: Record<AiKind, number> = { MEAL: 30, PLAN: 5, CHAT: 50 };

export function dailyLimit(kind: AiKind): number {
  const raw = Number(process.env[`AI_LIMIT_${kind}_PER_DAY`]);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LIMITS[kind];
}

export class AiLimitError extends Error {
  constructor(kind: AiKind, limit: number) {
    super(`Daily AI limit reached (${limit} ${kind.toLowerCase()} requests). Try again tomorrow.`);
  }
}

/**
 * Reserve one AI call for today. Increments first so concurrent requests
 * can't both slip under the limit; call the returned `refund` if the AI call
 * fails so failures don't count against the user.
 */
export async function reserveAiCall(userId: string, kind: AiKind, localDate: string) {
  const limit = dailyLimit(kind);
  const usage = await db.aiUsage.upsert({
    where: { userId_kind_localDate: { userId, kind, localDate } },
    create: { userId, kind, localDate, count: 1 },
    update: { count: { increment: 1 } },
  });
  const refund = () =>
    db.aiUsage.update({ where: { id: usage.id }, data: { count: { decrement: 1 } } }).then(() => undefined);
  if (usage.count > limit) {
    await refund();
    throw new AiLimitError(kind, limit);
  }
  return { refund, remaining: limit - usage.count };
}
