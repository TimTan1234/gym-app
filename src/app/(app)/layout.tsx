import { Suspense } from "react";
import { AppNav, AppNavFallback } from "@/components/AppNav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense fallback={<AppNavFallback />}>
        <AppNav />
      </Suspense>
      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 md:pl-60 md:pb-10 md:max-w-none lg:pr-[max(1rem,calc((100vw-56rem)/2))]">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </>
  );
}
