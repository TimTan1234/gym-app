import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";

/** Current user or redirect to sign-in. Use in pages and server actions. */
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return session.user;
}

/** Current user + profile; redirects to onboarding if no profile yet. */
export async function requireProfile() {
  const user = await requireUser();
  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) redirect("/onboarding");
  return { user, profile };
}

/** For route handlers: returns null instead of redirecting. */
export async function getUserForApi() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
