import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="space-y-4">
      <h1 className="display text-[34px]">{t("common.notFound")}</h1>
      <Link href="/today" className={buttonClass("secondary")}>
        {t("common.goToday")}
      </Link>
    </div>
  );
}
