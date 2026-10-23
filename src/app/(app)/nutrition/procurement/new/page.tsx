import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { dailyLimit } from "@/lib/ai/client";
import { todayLocal } from "@/lib/dates";
import { ProcurementNew } from "@/components/procurement/ProcurementNew";
import { checkProfileOf } from "@/lib/procurement/summary";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "New grocery plan" };

const MODES = ["import", "generate", "blank"] as const;

async function NewPlan({ searchParams }: { searchParams: PageProps<"/nutrition/procurement/new">["searchParams"] }) {
  const { user, profile } = await requireProfile();
  const sp = await searchParams;
  const mode = MODES.find((m) => m === sp.mode) ?? "import";
  const [usage, t] = await Promise.all([
    db.aiUsage.findUnique({
      where: { userId_kind_localDate: { userId: user.id, kind: "PROCUREMENT", localDate: todayLocal(profile.timezone) } },
      select: { count: true },
    }),
    getT(),
  ]);

  return (
    <>
      <PageHeader title={t("procurement.newTitle")} />
      <ProcurementNew
        // Switching mode from the list page starts over.
        key={mode}
        initialMode={mode}
        profile={checkProfileOf(profile)}
        currency="MYR"
        remaining={Math.max(0, dailyLimit("PROCUREMENT") - (usage?.count ?? 0))}
      />
    </>
  );
}

export default function NewProcurementPage(props: PageProps<"/nutrition/procurement/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewPlan searchParams={props.searchParams} />
    </Suspense>
  );
}
