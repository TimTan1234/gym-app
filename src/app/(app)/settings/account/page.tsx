import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { ChangePasswordForm, DeleteAccount } from "@/components/auth/AccountSettings";
import { SettingsSubpage } from "@/components/profile/SettingsSubpage";
import { Card, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Account" };

async function Account() {
  const [, t] = await Promise.all([requireProfile(), getT()]);
  return (
    <SettingsSubpage title={t("settings.account.title")}>
      <Card>
        <ChangePasswordForm />
      </Card>
      {/* Apart from the form, at the bottom, so it is never the next thing under Change password. */}
      <section className="mt-16 border-t border-line pt-6">
        <DeleteAccount />
      </section>
    </SettingsSubpage>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account />
    </Suspense>
  );
}
