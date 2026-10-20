"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { copyFromDayBefore } from "@/server/nutrition";
import type { MealSave } from "@/lib/ai/schemas";

/** One tap to repeat the previous day's meals of this type. */
export function CopyDayBefore({
  date,
  mealType,
  kcal,
  label,
}: {
  date: string;
  mealType: MealSave["mealType"];
  kcal: number;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await copyFromDayBefore(date, mealType);
          if (res.ok) toast.success(res.count === 1 ? "Meal copied" : `${res.count} meals copied`);
          else toast.error(res.error);
        })
      }
      className="flex w-full items-center gap-2 border-t border-line py-3 text-left text-sm text-steel hover:text-iron disabled:opacity-50"
    >
      <Copy className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{pending ? "Copying…" : label}</span>
      <span className="num">{Math.round(kcal).toLocaleString("en-US")} kcal</span>
    </button>
  );
}
