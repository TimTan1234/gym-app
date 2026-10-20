"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { Button } from "@/components/ui";
import { useClientValue } from "@/lib/use-client";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** "Install app" button (Chrome/Android/desktop) or an iOS Add-to-Home-Screen hint. */
export function InstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const ios = useClientValue(() => /iphone|ipad|ipod/i.test(navigator.userAgent), false);
  const installed = useClientValue(() => window.matchMedia("(display-mode: standalone)").matches, false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) return null;
  if (deferred) {
    return (
      <Button
        variant="secondary"
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        }}
      >
        <Download className="size-4" /> Install GymPal
      </Button>
    );
  }
  if (ios) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-steel">
        Install: tap <Share className="size-4" /> Share, then &ldquo;Add to Home Screen&rdquo;.
      </p>
    );
  }
  return null;
}
