import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,
  },
  // On by default in production; AUTH_RATE_LIMIT=off is only for the e2e test server.
  rateLimit: { enabled: process.env.AUTH_RATE_LIMIT !== "off" && process.env.NODE_ENV === "production" },
  plugins: [nextCookies()],
});
