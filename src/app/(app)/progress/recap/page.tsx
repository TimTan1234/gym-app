import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { getWeeklyRecap } from "@/lib/queries";
import { recapContent } from "@/components/progress/RecapCard";
import { RecapShare } from "@/components/progress/RecapShare";
import { BackLink, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Weekly recap" };

async function Recap() {
  const [{ user, profile }, t] = await Promise.all([requireProfile(), getT()]);
  const recap = await getWeeklyRecap(user.id, profile.timezone, profile.targetKcal);
  const content = recap && recapContent(recap, t, profile.unitSystem);
  return (
    <>
      <BackLink href="/progress" label={t("progress.title")} />
      <PageHeader title={t("progress.recap.title")} />
      {content ? (
        <RecapShare alt={content.description} fileName={`gympal-${recap.start}.png`} />
      ) : (
        <EmptyState title={t("progress.recap.empty")} />
      )}
    </>
  );
}

export default function RecapPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Recap />
    </Suspense>
  );
}
