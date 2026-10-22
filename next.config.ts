import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The Docker image runs the minimal standalone server; local `next start` and e2e keep the normal output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  partialPrefetching: true,
  experimental: {
    // Reuse a page's per-user data for 30s when navigating back to it, instead
    // of showing its loading skeleton again. Server actions still refresh it.
    staleTimes: { dynamic: 30 },
  },
  // Keep the dev badge clear of the bottom tab bar.
  devIndicators: { position: "top-right" },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera is needed for meal photos (file input capture).
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
