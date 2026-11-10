import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:3000"
  },
  webServer: {
    command: "corepack pnpm start --hostname 127.0.0.1",
    port: 3000,
    reuseExistingServer: false
  }
});
