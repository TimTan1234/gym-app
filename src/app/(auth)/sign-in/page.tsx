import { connection } from "next/server";
import { AuthForm } from "@/components/auth/AuthForm";
import { mailEnabled } from "@/lib/mail";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  await connection(); // SMTP is configured on the running server, not at build time
  return <AuthForm mode="sign-in" canReset={mailEnabled()} />;
}
