import { defineConfig, devices } from "@playwright/test";

// E2E builds and runs its own production server on :3100 with AI_MOCK=1, so
// tests are deterministic and never call the AI provider, even if .env has
// AI_MOCK=0 (only one `next dev` may run per project).
// live-ai.spec.ts is the exception (opt-in via LIVE_AI=1, uses :3000).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "next build && next start --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    env: { AI_MOCK: "1", BETTER_AUTH_URL: "http://localhost:3100" },
    timeout: 300_000,
  },
});
