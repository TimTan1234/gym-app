import { Suspense, type ReactNode } from "react";
import { AppNav, AppNavFallback, AppNavSkeleton } from "@/components/AppNav";
import { PageSkeleton } from "@/components/ui";
import { LocaleBoundary } from "@/i18n/LocaleBoundary";

function Shell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <>
      {nav}
      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 md:pl-60 md:pb-10 md:max-w-none lg:pr-[max(1rem,calc((100vw-56rem)/2))]">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    // The language comes from a cookie, so the app shell waits for it inside Suspense.
    <Suspense fallback={<Shell nav={<AppNavSkeleton />}><PageSkeleton /></Shell>}>
      <LocaleBoundary>
        <Shell
          nav={
            <Suspense fallback={<AppNavFallback />}>
              <AppNav />
            </Suspense>
          }
        >
          {children}
        </Shell>
      </LocaleBoundary>
    </Suspense>
  );
}
