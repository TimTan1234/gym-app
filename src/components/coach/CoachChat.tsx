"use client";

import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, Minus, Plus, Send, Sparkles } from "lucide-react";
import type { MealDraft, Proposal } from "@/lib/ai/coach";
import type { PlanChange } from "@/lib/ai/coach-edits";
import { sumNutrients } from "@/lib/nutrition/totals";
import { formatLocalDate } from "@/lib/dates";
import { INTL_LOCALE } from "@/i18n/config";
import { MacroLine } from "@/components/MacroLine";
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

const PLATES = { protein: "var(--plate-blue)", carbs: "var(--plate-yellow)", fat: "var(--plate-red)" } as const;

function TargetsBody({ proposal }: { proposal: Extract<Proposal, { kind: "targets" }> }) {
  const t = useT();
  return (
    <dl className="grid grid-cols-4 gap-2">
      {(
        [
          [t("common.kcal"), proposal.targetKcal.toLocaleString("en-US"), null],
          [t("common.protein"), `${proposal.targetProteinG} g`, PLATES.protein],
          [t("common.carbs"), `${proposal.targetCarbsG} g`, PLATES.carbs],
          [t("common.fat"), `${proposal.targetFatG} g`, PLATES.fat],
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
  );
}

/** Items of a meal as divided rows, then the total. */
function MealItems({ meal }: { meal: MealDraft }) {
  const t = useT();
  const totals = sumNutrients(meal.items);
  return (
    <>
      <ul className="divide-y divide-line border-y border-line">
        {meal.items.map((i, n) => (
          <li key={n} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="min-w-0">
              {i.name} <span className="num text-steel">{Math.round(i.grams)} g</span>
            </span>
            <span className="num shrink-0">{Math.round(i.kcal)}</span>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{t("coach.proposal.totalKcal", { kcal: Math.round(totals.kcal).toLocaleString("en-US") })}</span>
        <MacroLine p={totals.proteinG} c={totals.carbsG} f={totals.fatG} />
      </p>
    </>
  );
}

function PlanChanges({ changes }: { changes: PlanChange[] }) {
  const t = useT();
  const name = (c: { slug: string; name: string }) => exerciseName(t, c);
  const rx = (p: { sets: number; repMin: number; repMax: number; restSec: number }) =>
    t("coach.proposal.change.prescription", { sets: p.sets, repMin: p.repMin, repMax: p.repMax, rest: p.restSec });
  const line = (c: PlanChange): [string, "add" | "remove" | "change"] => {
    switch (c.type) {
      case "dayAdded":
        return [t("coach.proposal.change.dayAdded", { day: c.day }), "add"];
      case "dayRemoved":
        return [t("coach.proposal.change.dayRemoved", { day: c.day }), "remove"];
      case "dayRenamed":
        return [t("coach.proposal.change.dayRenamed", { from: c.from, to: c.to }), "change"];
      case "exerciseAdded":
        return [t("coach.proposal.change.exerciseAdded", { day: c.day, exercise: name(c), prescription: rx(c) }), "add"];
      case "exerciseRemoved":
        return [t("coach.proposal.change.exerciseRemoved", { day: c.day, exercise: name(c) }), "remove"];
      case "exerciseChanged":
        return [t("coach.proposal.change.exerciseChanged", { day: c.day, exercise: name(c), from: rx(c.from), to: rx(c.to) }), "change"];
    }
  };
  return (
    <ul className="space-y-1" data-testid="plan-changes">
      {changes.map((c, i) => {
        const [text, tone] = line(c);
        const Icon = tone === "add" ? Plus : tone === "remove" ? Minus : ArrowRight;
        return (
          <li key={i} className="flex items-start gap-2">
            <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "remove" ? "text-alert" : "text-steel")} aria-hidden />
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ProposalCard({ proposal, messageId, index }: { proposal: Proposal; messageId: string | null; index: number }) {
  const t = useT();
  const [applied, setApplied] = useState(Boolean(proposal.applied));
  const [pending, startTransition] = useTransition();
  const intl = INTL_LOCALE[t.locale];
  const mealType = (type: MealDraft["mealType"]) => t(`labels.mealType.${type}`);
  const day = (date: string) => formatLocalDate(date, undefined, intl);

  let title: string;
  let body: ReactNode;
  let success: string;
  switch (proposal.kind) {
    case "targets":
      title = t("coach.proposal.newTargets");
      body = <TargetsBody proposal={proposal} />;
      success = t("coach.proposal.targetsUpdated");
      break;
    case "plan":
      title = t("coach.proposal.newPlan", { name: proposal.plan.name });
      body = (
        <ul className="space-y-1">
          {proposal.plan.days.map((d, i) => (
            <li key={i}>
              <span className="font-semibold">{d.name}:</span>{" "}
              <span className="text-steel">{d.exercises.map((e) => `${exerciseName(t, { slug: e.exerciseSlug, name: e.exerciseName })} ${e.sets}×${e.repMin}–${e.repMax}`).join(t.locale === "zh" ? "、" : ", ")}</span>
            </li>
          ))}
        </ul>
      );
      success = t("coach.proposal.planSaved");
      break;
    case "planEdit":
      title = t("coach.proposal.editPlan", { name: proposal.planName });
      body = <PlanChanges changes={proposal.changes} />;
      success = t("coach.proposal.planUpdated");
      break;
    case "mealLog":
      // Mid-sentence in English ("Log lunch"); lowercasing leaves Chinese as it is.
      title = t("coach.proposal.logMeal", { mealType: mealType(proposal.meal.mealType).toLocaleLowerCase(), date: day(proposal.meal.localDate) });
      body = (
        <>
          <p className="font-medium">{proposal.meal.description}</p>
          <MealItems meal={proposal.meal} />
        </>
      );
      success = t("coach.proposal.mealLogged");
      break;
    case "mealUpdate": {
      const after = Math.round(sumNutrients(proposal.meal.items).kcal);
      title = t("coach.proposal.updateMeal", { description: proposal.before.description });
      body = (
        <>
          <p className="text-steel">
            {t("coach.proposal.mealOn", { mealType: mealType(proposal.meal.mealType), date: day(proposal.before.localDate), kcal: Math.round(proposal.before.kcal).toLocaleString("en-US") })}
          </p>
          <p className="score text-[22px]">{t("coach.proposal.beforeAfter", { before: Math.round(proposal.before.kcal).toLocaleString("en-US"), after: after.toLocaleString("en-US") })}</p>
          <MealItems meal={proposal.meal} />
        </>
      );
      success = t("coach.proposal.mealUpdated");
      break;
    }
    case "mealDelete":
      title = t("coach.proposal.deleteMeal", { description: proposal.before.description });
      body = (
        <p className="text-steel">
          {t("coach.proposal.mealOn", { mealType: mealType(proposal.before.mealType), date: day(proposal.before.localDate), kcal: Math.round(proposal.before.kcal).toLocaleString("en-US") })}
        </p>
      );
      success = t("coach.proposal.mealDeleted");
      break;
    default: {
      const unknown: never = proposal;
      return unknown;
    }
  }
  const isDelete = proposal.kind === "mealDelete";

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3 text-sm" data-testid="proposal">
      <p className="display text-[17px]">{title}</p>
      {body}
      <p className="text-[13px] text-steel">{proposal.reason}</p>
      <Button
        size="sm"
        variant={isDelete && !applied ? "danger" : "primary"}
        disabled={applied || pending || !messageId}
        onClick={() =>
          startTransition(async () => {
            if (!messageId) return;
            const res = await applyProposal(messageId, index);
            if (!res.ok) return void toast.error(res.error);
            setApplied(true);
            toast.success(success);
          })
        }
      >
        {applied ? (
          <>
            <Check className="size-4" /> {isDelete ? t("coach.proposal.deleted") : t("coach.proposal.applied")}
          </>
        ) : pending ? (
          t("coach.proposal.applying")
        ) : isDelete ? (
          t("coach.proposal.deleteButton")
        ) : (
          t("coach.proposal.apply")
        )}
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
