import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

// The service worker serves this page with no connection, so it must stay static:
// it shows both languages instead of reading the language cookie.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <WifiOff className="size-10 text-steel" />
      <h1 className="display text-[28px]">You&apos;re offline</h1>
      <p className="text-sm text-steel">
        GymPal needs a connection to sync your meals and workouts. Reconnect and refresh the page. A workout in progress is already saved.
      </p>
      <div lang="zh-Hans" className="mt-4 space-y-1 border-t border-line pt-4">
        <p className="display text-[22px]">你已离线</p>
        <p className="text-sm text-steel">GymPal 需要网络连接来同步你的饮食和训练。请重新连接并刷新页面。进行中的训练已经保存。</p>
      </div>
    </main>
  );
}
