import { newEntranceRequestSchema, type NewEntranceResponse } from "@parking/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireServiceApiKey } from "../plugins/service-auth";
import { allowEntrance } from "../services/entrance";

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireServiceApiKey);

  app.post("/new-entrance", async (request, reply): Promise<NewEntranceResponse | void> => {
    const parsed = newEntranceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    return allowEntrance(parsed.data.regNumber, request.log);
  });
};
