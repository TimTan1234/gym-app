import { ResetPasswordForm } from "@/components/auth/PasswordReset";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  // The emailed link lands here with ?token=…, or ?error=INVALID_TOKEN when it has expired or was used.
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" ? token : null} />;
}
