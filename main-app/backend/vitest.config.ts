import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is not set");
}

export default defineConfig({
  test: {
    env: { DATABASE_URL: testDatabaseUrl, JWT_SECRET: "test-jwt-secret-test-jwt-secret-1234", NODE_ENV: "test" },
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
  },
});
