import { createHash, timingSafeEqual } from "node:crypto";
import type { onRequestAsyncHookHandler } from "fastify";
import { env } from "../env";

const expectedKeyHash = hash(env.SERVICE_API_KEY);

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

export const requireServiceApiKey: onRequestAsyncHookHandler = async (request, reply) => {
  const providedKey = request.headers["x-api-key"];
  if (typeof providedKey !== "string" || !timingSafeEqual(hash(providedKey), expectedKeyHash)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
};
