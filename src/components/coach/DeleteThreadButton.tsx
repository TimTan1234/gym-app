"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteThread } from "@/server/coach";
import { useT } from "@/i18n/client";

export function DeleteThreadButton({ threadId, title, current }: { threadId: string; title: string; current: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={t("coach.deleteConversation", { title })}
      disabled={pending}
      className="grid size-8 shrink-0 place-items-center rounded-[8px] text-steel hover:bg-alert/10 hover:text-alert disabled:opacity-50"
      onClick={() => {
        if (!confirm(t("coach.confirmDeleteConversation"))) return;
        startTransition(async () => {
          const res = await deleteThread(threadId);
          if (!res.ok) return void toast.error(res.error);
          toast.success(t("coach.conversationDeleted"));
          if (current) router.replace("/coach");
        });
      }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
