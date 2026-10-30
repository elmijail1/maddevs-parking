import { fileURLToPath } from "node:url";
import { z } from "zod";

process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));

const envSchema = z.object({
  SERVICE_API_KEY: z.string().min(1),
  EMAIL_SERVICE_PORT: z.coerce.number().int().positive().default(3002),
});

export const env = envSchema.parse(process.env);
