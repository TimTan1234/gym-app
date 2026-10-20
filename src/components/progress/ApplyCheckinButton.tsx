"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { applyCheckin } from "@/server/profile";
import { Button } from "@/components/ui";

export function ApplyCheckinButton({ kcal }: { kcal: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="inverse"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await applyCheckin();
          if (res.ok) toast.success(`Target set to ${kcal.toLocaleString("en-US")} kcal`);
          else toast.error(res.error);
        })
      }
    >
      {pending ? "Saving…" : `Use ${kcal.toLocaleString("en-US")} kcal`}
    </Button>
  );
}
