import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";
import { LocaleBoundary } from "@/i18n/LocaleBoundary";

export const metadata = { title: "Set up your profile" };

async function Onboarding() {
  const user = await requireUser();
  const [profile, t] = await Promise.all([db.profile.findUnique({ where: { userId: user.id } }), getT()]);
  if (profile) redirect("/today");
  return (
    <>
      <h1 className="display text-[32px]">{t("settings.onboarding.title")}</h1>
      <p className="mb-6 mt-1 text-sm text-steel">{t("settings.onboarding.intro")}</p>
      <ProfileForm initial={{ name: user.name }} submitLabel={t("settings.onboarding.submit")} redirectTo="/today" />
    </>
  );
}

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <Suspense fallback={<PageSkeleton />}>
        <LocaleBoundary>
          <Onboarding />
        </LocaleBoundary>
      </Suspense>
    </main>
  );
}
