"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, Star, Trash2, Sparkles } from "lucide-react";
import { copyMealToToday, deleteMeal, saveFoodFromItem } from "@/server/nutrition";
import { Badge, Button, cn } from "@/components/ui";
import { MacroLine } from "@/components/MacroLine";
import { useT } from "@/i18n/client";

export interface MealCardData {
  id: string;
  description: string;
  source: "AI_TEXT" | "AI_PHOTO" | "MANUAL";
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  notes: string | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    grams: number;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    confidence: number | null;
    assumptions: string | null;
  }[];
}

export function MealCard({ meal, canCopy }: { meal: MealCardData; canCopy: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(success);
      else toast.error(res.error ?? t("common.somethingWrong"));
    });

  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-3.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{meal.description}</p>
          <p className="mt-1 flex items-center gap-2">
            <MacroLine p={meal.proteinG} c={meal.carbsG} f={meal.fatG} />
            {meal.source !== "MANUAL" && <Sparkles className="size-3.5 text-steel" aria-label={t("nutrition.aiEstimated")} />}
          </p>
        </div>
        <span className="text-right">
          <span className="score text-[26px]">{Math.round(meal.kcal)}</span>
          <span className="block text-[12px] text-steel">{t("common.kcal")}</span>
        </span>
        <ChevronDown className={cn("mt-0.5 size-4 text-steel transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="pb-4 pl-3">
          <ul className="divide-y divide-line">
            {meal.items.map((item) => (
              <li key={item.id} className="flex items-start gap-2 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.name}{" "}
                    <span className="num font-normal text-steel">
                      {t("nutrition.itemAmount", { quantity: item.quantity, unit: item.unit, grams: Math.round(item.grams) })}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="num text-[13px] font-medium">
                      {Math.round(item.kcal)} {t("common.kcal")}
                    </span>
                    <MacroLine p={item.proteinG} c={item.carbsG} f={item.fatG} />
                    {item.confidence !== null && item.confidence < 0.6 && <Badge>{t("nutrition.roughEstimateBadge")}</Badge>}
                  </p>
                  {item.assumptions && <p className="mt-0.5 text-xs italic text-steel">{item.assumptions}</p>}
                </div>
                <button
                  type="button"
                  aria-label={t("nutrition.saveToFavourites", { name: item.name })}
                  disabled={pending}
                  onClick={() => run(() => saveFoodFromItem(item.id), t("nutrition.savedFood", { name: item.name }))}
                  className="rounded-[8px] p-1.5 text-steel hover:bg-wash hover:text-iron"
                >
                  <Star className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          {meal.notes && <p className="mt-2 text-xs text-steel">{meal.notes}</p>}
          <div className="mt-3 flex gap-2">
            {canCopy && (
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => copyMealToToday(meal.id), t("nutrition.addedToToday"))}>
                <Copy className="size-4" /> {t("nutrition.logAgainToday")}
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (confirm(t("nutrition.confirmDelete"))) run(() => deleteMeal(meal.id), t("nutrition.mealDeleted"));
              }}
            >
              <Trash2 className="size-4" /> {t("common.delete")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
