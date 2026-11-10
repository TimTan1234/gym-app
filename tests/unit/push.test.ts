import { afterEach, describe, expect, it, vi } from "vitest";
import { vapidPublicKey } from "@/lib/push";

const KEYS = { VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private", VAPID_SUBJECT: "mailto:a@example.com" };

describe("vapidPublicKey", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("offers reminders only when all three VAPID values are set", () => {
    for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v);
    expect(vapidPublicKey()).toBe("public");
    for (const missing of Object.keys(KEYS)) {
      vi.stubEnv(missing, "");
      expect(vapidPublicKey()).toBeNull();
      vi.stubEnv(missing, KEYS[missing as keyof typeof KEYS]);
    }
  });
});
