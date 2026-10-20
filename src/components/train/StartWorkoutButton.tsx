"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { startWorkout } from "@/server/training";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/client";

export function StartWorkoutButton({
  planDayId,
  label,
  variant = "primary",
}: {
  planDayId?: string;
  label?: string;
  variant?: "primary" | "secondary" | "inverse" | "inverse-ghost";
}) {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await startWorkout(planDayId);
          if (res.ok && res.sessionId) router.push(`/train/workout/${res.sessionId}`);
          else if (!res.ok) toast.error(res.error);
        })
      }
    >
      <Play className="size-4" /> {pending ? t("train.starting") : (label ?? t("train.startWorkout"))}
    </Button>
  );
}
