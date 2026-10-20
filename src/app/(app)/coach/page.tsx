import { Suspense } from "react";
import Link from "next/link";
import { History, Plus } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import type { Proposal } from "@/lib/ai/coach";
import { CoachChat, type UiMessage } from "@/components/coach/CoachChat";
import { PageSkeleton, buttonClass, cn } from "@/components/ui";

export const metadata = { title: "Coach" };

async function Coach({ searchParams }: { searchParams: PageProps<"/coach">["searchParams"] }) {
  const { user } = await requireProfile();
  const sp = await searchParams;
  const threads = await db.chatThread.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true },
  });

  const requested = typeof sp.thread === "string" ? sp.thread : null;
  const thread = requested
    ? await db.chatThread.findFirst({
        where: { id: requested, userId: user.id },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
      })
    : null;

  const messages: UiMessage[] = (thread?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
    proposals: (m.proposals ?? []) as Proposal[],
  }));
  const prefill = typeof sp.q === "string" ? sp.q.slice(0, 500) : undefined;

  return (
    <>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h1 className="display text-[32px]">Coach</h1>
        <Link href="/coach" className={buttonClass("secondary", "sm")}>
          <Plus className="size-4" /> New chat
        </Link>
      </header>
      {threads.length > 0 && (
        <details className="mb-3 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 font-medium text-steel">
            <History className="size-4" /> Past conversations
          </summary>
          <ul className="mt-2 space-y-0.5">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/coach?thread=${t.id}`}
                  className={cn("block truncate rounded-[8px] px-2 py-1.5 hover:bg-wash", t.id === thread?.id && "bg-wash font-semibold")}
                >
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      {/* Keyed so switching threads (or a new prefill) starts fresh state. */}
      <CoachChat key={`${thread?.id ?? "new"}:${prefill ?? ""}`} threadId={thread?.id ?? null} initialMessages={messages} prefill={prefill} />
    </>
  );
}

export default function CoachPage(props: PageProps<"/coach">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Coach searchParams={props.searchParams} />
    </Suspense>
  );
}
