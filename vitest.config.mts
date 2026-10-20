import { defineConfig } from "vitest/config";

const src = new URL("./src", import.meta.url).pathname;
const empty = new URL("./tests/stubs/empty.ts", import.meta.url).pathname;

export default defineConfig({
  resolve: { alias: { "@": src, "server-only": empty } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
