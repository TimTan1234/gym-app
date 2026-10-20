"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { Button, Input, Label } from "@/components/ui";
import { useT } from "@/i18n/client";
import { messages } from "@/i18n/messages";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const t = useT();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const result =
      mode === "sign-up"
        ? await signUp.email({ email, password, name: String(form.get("name")) })
        : await signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      // Known Better Auth codes get a translated message; anything else shows the server's text.
      const code = result.error.code;
      setError(
        code && code in messages.en.auth.errors
          ? t(`auth.errors.${code as keyof typeof messages.en.auth.errors}`)
          : (result.error.message ?? t("auth.genericError")),
      );
      return;
    }
    router.push(mode === "sign-up" ? "/onboarding" : "/today");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-bold">{mode === "sign-up" ? t("auth.signUpTitle") : t("auth.signInTitle")}</h1>
      {mode === "sign-up" && (
        <Label>
          {t("auth.name")}
          <Input name="name" required autoComplete="name" maxLength={60} />
        </Label>
      )}
      <Label>
        {t("auth.email")}
        <Input name="email" type="email" required autoComplete="email" />
      </Label>
      <Label>
        {t("auth.password")}
        <Input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        />
      </Label>
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t("auth.pleaseWait") : mode === "sign-up" ? t("auth.createAccount") : t("auth.signIn")}
      </Button>
      <p className="text-center text-sm text-steel">
        {mode === "sign-up" ? (
          <>
            {t("auth.haveAccount")}{" "}
            <Link href="/sign-in" className="font-semibold text-iron underline">
              {t("auth.signIn")}
            </Link>
          </>
        ) : (
          <>
            {t("auth.newHere")}{" "}
            <Link href="/sign-up" className="font-semibold text-iron underline">
              {t("auth.createAnAccount")}
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
