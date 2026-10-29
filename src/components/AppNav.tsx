"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Utensils, Dumbbell, LineChart, MessageCircle } from "lucide-react";
import { cn } from "@/components/ui";
import { useT } from "@/i18n/client";

const tabs = [
  { href: "/today", label: "nav.today", icon: Home },
  { href: "/nutrition", label: "nav.food", icon: Utensils },
  { href: "/train", label: "nav.train", icon: Dumbbell },
  { href: "/progress", label: "nav.progress", icon: LineChart },
  { href: "/coach", label: "nav.coach", icon: MessageCircle },
] as const;

export function AppNav() {
  return <NavBar pathname={usePathname()} />;
}

/** Static nav (no active tab) shown while the pathname streams in. */
export function AppNavFallback() {
  return <NavBar pathname="" />;
}

/** Icons only, for before the language is known. */
export function AppNavSkeleton() {
  return <NavBar pathname="" bare />;
}

function NavBar({ pathname, bare = false }: { pathname: string; bare?: boolean }) {
  const t = useT();
  return (
    <nav
      aria-label={t("nav.main")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:left-0 md:right-auto md:w-56 md:border-r md:border-t-0 md:pb-0"
    >
      <div className="display hidden px-6 pb-6 pt-7 text-[30px] md:block">GymPal</div>
      <ul className="mx-auto flex max-w-lg justify-around md:max-w-none md:flex-col md:gap-1 md:px-3">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 pb-2 pt-2 text-[11px] font-medium md:flex-row md:gap-3 md:rounded-field md:px-3 md:py-2.5 md:text-[15px]",
                  active ? "text-iron md:bg-wash" : "text-steel hover:text-iron",
                )}
              >
                {/* Active marker: a strong-cream pill behind the icon (on desktop the whole row is tinted). */}
                <span className={cn("grid h-8 w-14 place-items-center rounded-full transition-colors md:contents", active && "bg-wash")}>
                  <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                <span className={cn(bare && "invisible")}>{t(label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
