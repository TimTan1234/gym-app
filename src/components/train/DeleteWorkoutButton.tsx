"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { discardWorkout } from "@/server/training";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/client";

export function DeleteWorkoutButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={t("train.deleteWorkout")}
      disabled={pending}
      onClick={() => {
        if (!confirm(t("train.deleteWorkoutConfirm"))) return;
        startTransition(async () => {
          await discardWorkout(sessionId);
          router.push("/train/history");
        });
      }}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
