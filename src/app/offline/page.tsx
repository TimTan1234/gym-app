import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <WifiOff className="size-10 text-steel" />
      <h1 className="display text-[28px]">You&apos;re offline</h1>
      <p className="text-sm text-steel">
        GymPal needs a connection to sync your meals and workouts. Reconnect and refresh the page. A workout in progress is already saved.
      </p>
    </main>
  );
}
