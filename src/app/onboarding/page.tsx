import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { PageSkeleton } from "@/components/ui";

export const metadata = { title: "Set up your profile" };

async function Onboarding() {
  const user = await requireUser();
  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (profile) redirect("/today");
  return <ProfileForm initial={{ name: user.name }} submitLabel="Calculate my targets" redirectTo="/today" />;
}

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <h1 className="display text-[32px]">Set up your profile</h1>
      <p className="mb-6 mt-1 text-sm text-steel">
        We use this to calculate your daily calorie and macro targets and to tailor training plans.
      </p>
      <Suspense fallback={<PageSkeleton />}>
        <Onboarding />
      </Suspense>
    </main>
  );
}
