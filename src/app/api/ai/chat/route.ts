import { z } from "zod";
import { db } from "@/lib/db";
import { getUserForApi } from "@/lib/session";
import { AiLimitError, reserveAiCall } from "@/lib/ai/client";
import { runCoach, type ChatTurn, type Proposal } from "@/lib/ai/coach";
import { todayLocal } from "@/lib/dates";

const BodySchema = z.object({
  threadId: z.string().nullable(),
  message: z.string().trim().min(1).max(2000),
});

const HISTORY_LIMIT = 20;

export type ChatEvent =
  | { type: "thread"; threadId: string }
  | { type: "delta"; text: string }
  | { type: "proposal"; proposal: Proposal }
  | { type: "done"; messageId: string }
  | { type: "error"; error: string };

export async function POST(request: Request) {
  const user = await getUserForApi();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) return Response.json({ error: "Complete your profile first" }, { status: 400 });

  let reservation;
  try {
    reservation = await reserveAiCall(user.id, "CHAT", todayLocal(profile.timezone));
  } catch (e) {
    if (e instanceof AiLimitError) return Response.json({ error: e.message }, { status: 429 });
    throw e;
  }

  // Load or create the thread (ownership enforced).
  let threadId = body.data.threadId;
  if (threadId) {
    const thread = await db.chatThread.findFirst({ where: { id: threadId, userId: user.id } });
    if (!thread) {
      await reservation.refund();
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
  } else {
    const thread = await db.chatThread.create({ data: { userId: user.id, title: body.data.message.slice(0, 60) } });
    threadId = thread.id;
  }

  await db.chatMessage.create({ data: { threadId, role: "user", content: body.data.message } });
  const recent = await db.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { role: true, content: true },
  });
  const history = recent.reverse().map((m) => ({ role: m.role, content: m.content }) as ChatTurn);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      send({ type: "thread", threadId: threadId! });
      try {
        const result = await runCoach(
          { userId: user.id, userName: user.name, timezone: profile.timezone, sex: profile.sex },
          history,
          { onDelta: (text) => send({ type: "delta", text }), onProposal: (proposal) => send({ type: "proposal", proposal }) },
        );
        const saved = await db.chatMessage.create({
          data: {
            threadId: threadId!,
            role: "assistant",
            content: result.text || "(no response)",
            proposals: result.proposals.length ? (result.proposals as object[]) : undefined,
          },
        });
        await db.chatThread.update({ where: { id: threadId! }, data: { updatedAt: new Date() } });
        send({ type: "done", messageId: saved.id });
      } catch (e) {
        console.error("coach failed", e);
        await reservation.refund();
        send({ type: "error", error: "The coach is unavailable right now. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
