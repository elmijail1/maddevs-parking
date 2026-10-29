import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": env.MAIN_APP_URL ?? "http://localhost:3000",
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
    },
  };
});
