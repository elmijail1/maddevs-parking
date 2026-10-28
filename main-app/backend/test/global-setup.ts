import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function setup() {
  execSync("pnpm exec prisma migrate deploy", {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
