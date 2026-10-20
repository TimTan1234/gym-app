"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui";

export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        await signOut();
        // Hard navigation: previously visited routes stay mounted client-side,
        // so drop all in-memory state rather than leave it for the next user.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full reload on sign-out
        window.location.assign("/sign-in");
      }}
    >
      <LogOut className="size-4" /> Sign out
    </Button>
  );
}
