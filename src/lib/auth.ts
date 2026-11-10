import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { mailEnabled, sendMail } from "./mail";
import { getT } from "@/i18n/server";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // "Forgot password?" mails a link, so it exists only when SMTP is configured.
    sendResetPassword: mailEnabled()
      ? async ({ user, url }) => {
          const t = await getT();
          await sendMail({ to: user.email, subject: t("auth.reset.emailSubject"), text: t("auth.reset.emailBody", { name: user.name, url }) });
        }
      : undefined,
  },
  user: {
    deleteUser: {
      enabled: true,
      // Everything else cascades from the user row. Workouts and plans go first: their sets and
      // plan exercises would otherwise still hold the user's custom exercises when those are deleted.
      beforeDelete: async (user) => {
        await db.$transaction([
          db.workoutSession.deleteMany({ where: { userId: user.id } }),
          db.trainingPlan.deleteMany({ where: { userId: user.id } }),
        ]);
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,
  },
  // On by default in production; AUTH_RATE_LIMIT=off is only for the e2e test server.
  rateLimit: { enabled: process.env.AUTH_RATE_LIMIT !== "off" && process.env.NODE_ENV === "production" },
  plugins: [nextCookies()],
});
