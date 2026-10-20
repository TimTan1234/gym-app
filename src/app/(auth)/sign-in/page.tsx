import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return <AuthForm mode="sign-in" />;
}
