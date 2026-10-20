"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, Send, Sparkles } from "lucide-react";
import type { Proposal } from "@/lib/ai/coach";
import type { ChatEvent } from "@/app/api/ai/chat/route";
import { applyProposal } from "@/server/coach";
import { Button, Textarea, cn, Plate } from "@/components/ui";
import { useT } from "@/i18n/client";
import { exerciseName } from "@/i18n/labels";

export interface UiMessage {
  id: string | null;
  role: "user" | "assistant";
  content: string;
  proposals: Proposal[];
}

const SUGGESTIONS = ["protein", "dinner", "workout", "targets"] as const;

/** Minimal, safe markdown: paragraphs, "- " bullets and **bold**. No HTML injection. */
function Markdown({ text }: { text: string }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*]|\d+\.)\s/, ""))}</li>)}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l.replace(/^#+\s*/, ""))}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function ProposalCard({ proposal, messageId, index }: { proposal: Proposal; messageId: string | null; index: number }) {
  const t = useT();
  const [applied, setApplied] = useState(Boolean(proposal.applied));
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3 text-sm" data-testid="proposal">
      <p className="display text-[17px]">{proposal.kind === "targets" ? t("coach.proposal.newTargets") : t("coach.proposal.newPlan", { name: proposal.plan.name })}</p>
      {proposal.kind === "targets" ? (
        <dl className="grid grid-cols-4 gap-2">
          {(
            [
              [t("common.kcal"), proposal.targetKcal.toLocaleString("en-US"), null],
              [t("common.protein"), `${proposal.targetProteinG} g`, "var(--plate-blue)"],
              [t("common.carbs"), `${proposal.targetCarbsG} g`, "var(--plate-yellow)"],
              [t("common.fat"), `${proposal.targetFatG} g`, "var(--plate-red)"],
            ] as const
          ).map(([k, v, color]) => (
            <div key={k} className="flex flex-col-reverse">
              <dt className="flex items-center gap-1 text-[12px] text-steel">
                {color && <Plate color={color} className="h-3 w-[5px]" />} {k}
              </dt>
              <dd className="score text-[22px]">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <ul className="space-y-1">
          {proposal.plan.days.map((d, i) => (
            <li key={i}>
              <span className="font-semibold">{d.name}:</span>{" "}
              <span className="text-steel">{d.exercises.map((e) => `${exerciseName(t, { slug: e.exerciseSlug, name: e.exerciseName })} ${e.sets}×${e.repMin}–${e.repMax}`).join(t.locale === "zh" ? "、" : ", ")}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-steel">{proposal.reason}</p>
      <Button
        size="sm"
        disabled={applied || pending || !messageId}
        onClick={() =>
          startTransition(async () => {
            if (!messageId) return;
            const res = await applyProposal(messageId, index);
            if (!res.ok) return void toast.error(res.error);
            setApplied(true);
            toast.success(proposal.kind === "targets" ? t("coach.proposal.targetsUpdated") : t("coach.proposal.planSaved"));
          })
        }
      >
        {applied ? <><Check className="size-4" /> {t("coach.proposal.applied")}</> : pending ? t("coach.proposal.applying") : t("coach.proposal.apply")}
      </Button>
    </div>
  );
}

export function CoachChat({ threadId: initialThreadId, initialMessages, prefill }: { threadId: string | null; initialMessages: UiMessage[]; prefill?: string }) {
  const t = useT();
  const [threadId, setThreadId] = useState(initialThreadId);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState(prefill ?? "");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function patchLast(fn: (m: UiMessage) => UiMessage) {
    setMessages((cur) => [...cur.slice(0, -1), fn(cur[cur.length - 1])]);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((cur) => [
      ...cur,
      { id: null, role: "user", content: message, proposals: [] },
      { id: null, role: "assistant", content: "", proposals: [] },
    ]);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("coach.errors.unavailableShort"));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ChatEvent;
          if (event.type === "thread" && event.threadId !== threadId) {
            setThreadId(event.threadId);
            window.history.replaceState(null, "", `/coach?thread=${event.threadId}`);
          } else if (event.type === "delta") patchLast((m) => ({ ...m, content: m.content + event.text }));
          else if (event.type === "proposal") patchLast((m) => ({ ...m, proposals: [...m.proposals, event.proposal] }));
          else if (event.type === "done") patchLast((m) => ({ ...m, id: event.messageId }));
          else if (event.type === "error") throw new Error(event.error);
        }
      }
      // No router.refresh() here: it would re-key and remount this component,
      // wiping anything the user has started typing. The URL is already updated.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.somethingWrong"));
      setMessages((cur) => (cur.at(-1)?.content ? cur : cur.slice(0, -1)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
      <div className="flex-1 space-y-4 pb-4" aria-live="polite" aria-busy={busy} data-testid="chat-log">
        {messages.length === 0 && (
          <div className="space-y-3 py-6 text-center">
            <Sparkles className="mx-auto size-8 text-iron" />
            <p className="font-semibold">{t("coach.emptyTitle")}</p>
            <p className="text-sm text-steel">{t("coach.emptyBody")}</p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {SUGGESTIONS.map((key) => {
                const s = t(`coach.suggestions.${key}`);
                return (
                  <button key={key} type="button" onClick={() => send(s)} className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm hover:border-iron">
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id ?? `pending-${i}`} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[88%] rounded-[14px] px-4 py-2.5 text-sm",
                m.role === "user" ? "rounded-br-md bg-iron text-iron-fg" : "rounded-bl-md border border-line bg-paper",
              )}
            >
              {m.role === "assistant" && !m.content && busy && i === messages.length - 1 ? (
                <Loader2 className="size-4 animate-spin text-steel" aria-label={t("coach.thinking")} />
              ) : m.role === "assistant" ? (
                <Markdown text={m.content} />
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
              {m.proposals.map((p, j) => (
                <ProposalCard key={j} proposal={p} messageId={m.id} index={j} />
              ))}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-20 z-20 flex items-end gap-2 rounded-[14px] border border-line bg-paper p-2 shadow-[0_8px_24px_-12px_rgba(31,34,38,0.45)] md:bottom-4"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder={t("coach.placeholder")}
          aria-label={t("coach.messageLabel")}
          maxLength={2000}
          rows={1}
          className="min-h-10 resize-none border-0 bg-transparent"
        />
        <Button type="submit" disabled={busy || !input.trim()} aria-label={t("coach.send")}>
          <Send className="size-4" />
        </Button>
      </form>
      <p className="mt-2 text-center text-[11px] text-steel">{t("coach.disclaimer")}</p>
    </div>
  );
}
