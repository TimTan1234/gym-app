import { Suspense } from "react";
import { existsSync } from "node:fs";
import path from "node:path";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { LINK_CODE_MINUTES } from "@/lib/devices";
import { LinkedPhones } from "@/components/profile/LinkedPhones";
import { SettingsSubpage } from "@/components/profile/SettingsSubpage";
import { Card, PageSkeleton } from "@/components/ui";
import { INTL_LOCALE } from "@/i18n/config";
import { getT } from "@/i18n/server";

export const metadata = { title: "Phone health data" };

async function Phone() {
  const { user, profile } = await requireProfile();
  const [t, phones] = await Promise.all([
    getT(),
    db.linkedDevice.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, lastSyncAt: true } }),
  ]);
  // The address the phone must reach: the one this deployment is configured with.
  const serverUrl = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  // Offered once scripts/build-android.sh has put the app in public/downloads.
  const apk = existsSync(path.join(process.cwd(), "public/downloads/gympal-health.apk")) ? "/downloads/gympal-health.apk" : null;
  const when = (d: Date) => d.toLocaleString(INTL_LOCALE[t.locale], { timeZone: profile.timezone, dateStyle: "medium", timeStyle: "short" });
  return (
    <SettingsSubpage title={t("settings.phone.title")}>
      <Card id="phone">
        <LinkedPhones phones={phones.map((p) => ({ id: p.id, name: p.name, lastSync: p.lastSyncAt ? when(p.lastSyncAt) : null }))} serverUrl={serverUrl} minutes={LINK_CODE_MINUTES} apk={apk} />
      </Card>
    </SettingsSubpage>
  );
}

export default function PhonePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Phone />
    </Suspense>
  );
}
