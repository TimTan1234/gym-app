"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { Button, Input, Label } from "@/components/ui";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    router.push(mode === "sign-up" ? "/onboarding" : "/today");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-bold">{mode === "sign-up" ? "Create your account" : "Welcome back"}</h1>
      {mode === "sign-up" && (
        <Label>
          Name
          <Input name="name" required autoComplete="name" maxLength={60} />
        </Label>
      )}
      <Label>
        Email
        <Input name="email" type="email" required autoComplete="email" />
      </Label>
      <Label>
        Password
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
        {pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-steel">
        {mode === "sign-up" ? (
          <>
            Already have an account? <Link href="/sign-in" className="font-semibold text-iron underline">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/sign-up" className="font-semibold text-iron underline">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}
