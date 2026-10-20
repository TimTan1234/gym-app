"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Utensils, Dumbbell, LineChart, MessageCircle } from "lucide-react";
import { cn } from "@/components/ui";

const tabs = [
  { href: "/today", label: "Today", icon: Home },
  { href: "/nutrition", label: "Food", icon: Utensils },
  { href: "/train", label: "Train", icon: Dumbbell },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/coach", label: "Coach", icon: MessageCircle },
];

export function AppNav() {
  return <NavBar pathname={usePathname()} />;
}

/** Static nav (no active tab) shown while the pathname streams in. */
export function AppNavFallback() {
  return <NavBar pathname="" />;
}

function NavBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:left-0 md:right-auto md:w-56 md:border-r md:border-t-0 md:pb-0"
    >
      <div className="score hidden px-6 pb-6 pt-7 text-[30px] md:block">GymPal</div>
      <ul className="mx-auto flex max-w-lg justify-around md:max-w-none md:flex-col md:gap-1 md:px-3">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium md:flex-row md:gap-3 md:rounded-[10px] md:px-3 md:py-2.5 md:text-[15px]",
                  active ? "text-iron md:bg-wash" : "text-steel hover:text-iron",
                )}
              >
                {/* Active marker: a short iron bar, like a plate on the bar */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-0 h-[3px] w-6 rounded-b-[2px] bg-iron md:hidden",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
