import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3100" },
  webServer: {
    command: "pnpm build:profile && pnpm start --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
