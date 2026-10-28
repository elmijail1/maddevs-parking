import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  MAIN_APP_PORT: z.coerce.number().int().positive().default(3000),
  SERVICE_API_KEY: z.string().min(16),
});

export const env = envSchema.parse(process.env);
