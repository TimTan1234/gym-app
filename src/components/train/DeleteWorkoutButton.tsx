"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { discardWorkout } from "@/server/training";
import { Button } from "@/components/ui";

export function DeleteWorkoutButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Delete workout"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this workout permanently? PRs set in it will be removed.")) return;
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
