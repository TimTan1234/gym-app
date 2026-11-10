"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button, Input, Label } from "@/components/ui";
import { useT } from "@/i18n/client";
import { authErrorText } from "./errors";

const linkClass = "font-semibold text-iron underline";

export function ForgotPasswordForm() {
  const t = useT();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const email = String(new FormData(e.currentTarget).get("email"));
    const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    if (result.error) return setError(authErrorText(t, result.error));
    setSentTo(email);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-bold">{t("auth.forgot.title")}</h1>
      {sentTo ? (
        <p role="status">{t("auth.forgot.sent", { email: sentTo })}</p>
      ) : (
        <>
          <Label>
            {t("auth.email")}
            <Input name="email" type="email" required autoComplete="email" />
          </Label>
          {error && (
            <p role="alert" className="text-sm text-alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? t("auth.pleaseWait") : t("auth.forgot.send")}
          </Button>
        </>
      )}
      <p className="text-center text-sm">
        <Link href="/sign-in" className={linkClass}>
          {t("auth.forgot.backToSignIn")}
        </Link>
      </p>
    </form>
  );
}

/** Reached from the emailed link, which carries the token, or an error when the link is no good. */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("auth.reset.title")}</h1>
        <p role="alert">{t("auth.reset.invalid")}</p>
        <Link href="/forgot-password" className={linkClass}>
          {t("auth.reset.newLink")}
        </Link>
      </div>
    );
  }
  const resetToken = token;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const newPassword = String(new FormData(e.currentTarget).get("password"));
    const result = await authClient.resetPassword({ newPassword, token: resetToken });
    setPending(false);
    if (result.error) return setError(authErrorText(t, result.error));
    toast.success(t("auth.reset.done"));
    router.push("/sign-in");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-bold">{t("auth.reset.title")}</h1>
      <Label>
        {t("auth.reset.newPassword")}
        <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Label>
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t("auth.pleaseWait") : t("auth.reset.submit")}
      </Button>
    </form>
  );
}
