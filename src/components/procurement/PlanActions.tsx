"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Copy, Files, Loader2, MoreHorizontal, RotateCcw, Star, Trash2, CheckCheck } from "lucide-react";
import { deleteProcurementPlan, duplicateProcurementPlan, saveItemsToFoods, updateProcurementPlan } from "@/server/procurement";
import type { GroceryCategory } from "@/lib/ai/schemas";
import { planToMarkdown } from "@/lib/procurement/summary";
import { Button, Card, IconButton, Input, Label } from "@/components/ui";
import { NumField } from "./fields";
import { useT } from "@/i18n/client";

interface MenuPlan {
  id: string;
  title: string;
  status: "ACTIVE" | "DONE" | "ARCHIVED";
  days: number;
  people: number;
  budget: number | null;
  currency: string;
  items: { name: string; quantity: number; unit: string; category: GroceryCategory; estPrice: number | null; checked: boolean; sortOrder: number }[];
}

/** Rename, change the period or budget, finish, copy, share or delete a plan. */
export function PlanMenu({ plan }: { plan: MenuPlan }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, startBusy] = useTransition();

  const act = (action: () => Promise<{ ok: boolean; error?: string; id?: string }>, after?: (id?: string) => void) =>
    startBusy(async () => {
      const res = await action();
      if (!res.ok) return void toast.error(res.error ?? t("common.somethingWrong"));
      setOpen(false);
      after?.(res.id);
    });

  async function copy() {
    const text = planToMarkdown(plan, (c) => t(`labels.groceryCategory.${c}`), t.locale);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("procurement.menu.copied"));
    } catch {
      toast.error(t("common.somethingWrong"));
    }
    setOpen(false);
  }

  return (
    <div className="relative">
      <IconButton edge="end" aria-label={t("procurement.menu.label")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="size-5" />
      </IconButton>
      {open && (
        <Card className="absolute right-0 top-10 z-30 w-60 space-y-0.5 border border-line p-1.5 shadow-[0_8px_24px_-12px_rgba(20,20,19,0.45)]">
          <MenuButton onClick={() => (setEditing(true), setOpen(false))}>{t("procurement.menu.editDetails")}</MenuButton>
          {plan.status === "ACTIVE" ? (
            <MenuButton disabled={busy} onClick={() => act(() => updateProcurementPlan(plan.id, { status: "DONE" }))}>
              <CheckCheck className="size-4" /> {t("procurement.menu.markDone")}
            </MenuButton>
          ) : (
            <MenuButton disabled={busy} onClick={() => act(() => updateProcurementPlan(plan.id, { status: "ACTIVE" }))}>
              <RotateCcw className="size-4" /> {t("procurement.menu.reopen")}
            </MenuButton>
          )}
          <MenuButton
            disabled={busy}
            onClick={() =>
              act(
                () => duplicateProcurementPlan(plan.id),
                (id) => {
                  toast.success(t("procurement.menu.duplicated"));
                  if (id) router.push(`/nutrition/procurement/${id}`);
                },
              )
            }
          >
            <Files className="size-4" /> {t("procurement.menu.duplicate")}
          </MenuButton>
          <MenuButton onClick={copy}>
            <Copy className="size-4" /> {t("procurement.menu.copyMarkdown")}
          </MenuButton>
          <MenuButton
            danger
            disabled={busy}
            onClick={() => {
              if (!window.confirm(t("procurement.menu.confirmDelete", { title: plan.title }))) return;
              act(
                () => deleteProcurementPlan(plan.id),
                () => router.push("/nutrition/procurement"),
              );
            }}
          >
            <Trash2 className="size-4" /> {t("common.delete")}
          </MenuButton>
        </Card>
      )}
      {editing && <DetailsEditor plan={plan} onClose={() => setEditing(false)} />}
    </div>
  );
}

function MenuButton({ danger, ...props }: React.ComponentProps<"button"> & { danger?: boolean }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-field px-3 py-2 text-left text-sm font-medium disabled:opacity-50 ${danger ? "text-alert hover:bg-alert/10" : "hover:bg-wash"}`}
      {...props}
    />
  );
}

function DetailsEditor({ plan, onClose }: { plan: MenuPlan; onClose: () => void }) {
  const t = useT();
  const [title, setTitle] = useState(plan.title);
  const [days, setDays] = useState(plan.days);
  const [people, setPeople] = useState(plan.people);
  const [budget, setBudget] = useState(plan.budget);
  const [saving, startSaving] = useTransition();

  return (
    <Card className="absolute right-0 top-10 z-30 w-[min(22rem,calc(100vw-2rem))] space-y-3 border border-line shadow-[0_8px_24px_-12px_rgba(20,20,19,0.45)]">
      <Label>
        {t("procurement.fields.title")}
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </Label>
      <div className="grid grid-cols-3 items-end gap-2">
        <NumField label={t("procurement.fields.days")} value={days} min={1} max={31} step="1" onChange={(v) => setDays(Math.round(v ?? 1))} />
        <NumField label={t("procurement.fields.people")} value={people} min={1} max={12} step="1" onChange={(v) => setPeople(Math.round(v ?? 1))} />
        <NumField label={t("procurement.fields.budget", { currency: plan.currency })} value={budget} nullable onChange={setBudget} />
      </div>
      {(days !== plan.days || people !== plan.people) && <p className="text-xs text-steel">{t("procurement.nutrition.reshared")}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving || !title.trim()}
          onClick={() =>
            startSaving(async () => {
              const res = await updateProcurementPlan(plan.id, { title: title.trim(), days, people, budget });
              if (!res.ok) return void toast.error(res.error);
              onClose();
            })
          }
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </Card>
  );
}

/** Asks the AI for nutrition of items typed in by hand. */
export function EstimateButton({ planId, count }: { planId: string; count: number }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function estimate() {
    setBusy(true);
    try {
      const res = await fetch("/api/ai/procurement/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = (await res.json().catch(() => ({}))) as { updated?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? t("procurement.errors.estimateFailed"));
      toast.success(t("procurement.nutrition.estimated", { count: data.updated ?? 0 }));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("procurement.errors.estimateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={estimate} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
      {t("procurement.nutrition.estimateMissing", { count })}
    </Button>
  );
}

/** Saves bought food (or all of it if nothing is ticked yet) as 100 g Saved Foods. */
export function SaveToFoodsButton({ planId, itemIds }: { planId: string; itemIds: string[] }) {
  const t = useT();
  const [busy, startBusy] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={busy || itemIds.length === 0}
      onClick={() =>
        startBusy(async () => {
          const res = await saveItemsToFoods(planId, itemIds);
          if (!res.ok) return void toast.error(res.error);
          toast.success(t("procurement.nutrition.savedToFoods", { added: res.added ?? 0, existing: res.alreadySaved ?? 0 }));
        })
      }
    >
      <Star className="size-4" /> {t("procurement.nutrition.saveToFoods", { count: itemIds.length })}
    </Button>
  );
}
