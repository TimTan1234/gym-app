import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { FormCheckLazy } from "@/components/train/FormCheckLazy";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Squat form check" };

async function FormCheck() {
  await requireProfile();
  const t = await getT();
  return (
    <div>
      <PageHeader title={t("train.formCheck.title")} subtitle={t("train.formCheck.subtitle")} />
      <FormCheckLazy />
    </div>
  );
}

export default function FormCheckPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FormCheck />
    </Suspense>
  );
}
