import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/PasswordReset";
import { mailEnabled } from "@/lib/mail";

export const metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  await connection(); // SMTP is configured on the running server, not at build time
  if (!mailEnabled()) notFound();
  return <ForgotPasswordForm />;
}
