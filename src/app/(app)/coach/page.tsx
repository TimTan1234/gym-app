import { Suspense } from "react";
import Link from "next/link";
import { History, Plus } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import type { Proposal } from "@/lib/ai/coach";
import { CoachSession, type UiMessage } from "@/components/coach/CoachChat";
import { DeleteThreadButton } from "@/components/coach/DeleteThreadButton";
import { PageSkeleton, buttonClass, cn } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Coach" };

async function Coach({ searchParams }: { searchParams: PageProps<"/coach">["searchParams"] }) {
  const { user } = await requireProfile();
  const [sp, t] = await Promise.all([searchParams, getT()]);
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
        <h1 className="display text-[32px]">{t("coach.title")}</h1>
        <Link href="/coach" className={buttonClass("secondary", "sm")}>
          <Plus className="size-4" /> {t("coach.newChat")}
        </Link>
      </header>
      {threads.length > 0 && (
        <details className="mb-3 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 font-medium text-steel">
            <History className="size-4" /> {t("coach.pastConversations")}
          </summary>
          <ul className="mt-2 space-y-0.5">
            {threads.map((t) => (
              <li key={t.id} className="flex items-center gap-1">
                <Link
                  href={`/coach?thread=${t.id}`}
                  className={cn("block min-w-0 flex-1 truncate rounded-[8px] px-2 py-1.5 hover:bg-wash", t.id === thread?.id && "bg-wash font-semibold")}
                >
                  {t.title}
                </Link>
                <DeleteThreadButton threadId={t.id} title={t.title} current={t.id === thread?.id} />
              </li>
            ))}
          </ul>
        </details>
      )}
      <CoachSession threadId={thread?.id ?? null} initialMessages={messages} prefill={prefill} />
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
