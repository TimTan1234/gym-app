import { Suspense } from "react";
import { Bell, CircleUserRound, Download, Droplet, Flower2, Smartphone, SunMoon, Target, UserRound } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { vapidPublicKey } from "@/lib/push";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { InstallApp } from "@/components/InstallApp";
import { NavRow, PageHeader, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Settings" };

async function Settings() {
  const [{ user, profile }, t] = await Promise.all([requireProfile(), getT()]);
  // Most used first: the targets people come to check or change, then the profile they're worked out from.
  const rows = [
    { href: "/settings/targets", icon: Target, label: t("settings.dailyTargets") },
    { href: "/settings/profile", icon: UserRound, label: t("settings.profile") },
    { href: "/settings/diabetes", icon: Droplet, label: t("glucose.settings.title") },
    ...(profile.sex === "FEMALE" ? [{ href: "/settings/cycle", icon: Flower2, label: t("cycle.settings.title") }] : []),
    // Offered once the server has VAPID keys to send with.
    ...(vapidPublicKey() ? [{ href: "/settings/reminders", icon: Bell, label: t("settings.reminders.title") }] : []),
    { href: "/settings/phone", icon: Smartphone, label: t("settings.phone.title") },
    { href: "/settings/display", icon: SunMoon, label: t("settings.display") },
    { href: "/settings/data", icon: Download, label: t("settings.export.title") },
    { href: "/settings/account", icon: CircleUserRound, label: t("settings.account.title") },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} />
      <InstallApp />
      <nav aria-label={t("settings.title")} className="divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <NavRow key={row.href} {...row} />
        ))}
      </nav>
      <section className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{user.name}</p>
          <p className="truncate text-[13px] text-steel">{user.email}</p>
        </div>
        <SignOutButton />
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}
