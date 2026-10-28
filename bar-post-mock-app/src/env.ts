import { fileURLToPath } from "node:url";
import { z } from "zod";

process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));

const envSchema = z.object({
  MAIN_APP_URL: z.url(),
  SERVICE_API_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
