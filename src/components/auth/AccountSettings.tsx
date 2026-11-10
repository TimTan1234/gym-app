"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button, Input, Label } from "@/components/ui";
import { useT } from "@/i18n/client";
import { authErrorText } from "./errors";

export function ChangePasswordForm() {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setError(null);
    setPending(true);
    const result = await authClient.changePassword({
      currentPassword: String(data.get("currentPassword")),
      newPassword: String(data.get("newPassword")),
    });
    setPending(false);
    if (result.error) return setError(authErrorText(t, result.error));
    form.reset();
    toast.success(t("settings.account.passwordChanged"));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Label>
        {t("settings.account.currentPassword")}
        <Input name="currentPassword" type="password" required autoComplete="current-password" />
      </Label>
      <Label>
        {t("settings.account.newPassword")}
        <Input name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
      </Label>
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t("common.saving") : t("settings.account.changePassword")}
      </Button>
    </form>
  );
}

/** Deleting takes the password, after a warning that everything goes with the account. */
export function DeleteAccount() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        {t("settings.account.deleteAccount")}
      </Button>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await authClient.deleteUser({ password: String(new FormData(e.currentTarget).get("password")) });
    setPending(false);
    if (result.error) return setError(authErrorText(t, result.error));
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-alert">{t("settings.account.deleteWarning")}</p>
      <Label>
        {t("auth.password")}
        <Input name="password" type="password" required autoComplete="current-password" autoFocus />
      </Label>
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? t("auth.pleaseWait") : t("settings.account.deleteConfirm")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
