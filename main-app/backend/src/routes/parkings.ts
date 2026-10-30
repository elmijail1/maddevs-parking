import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUser } from "../plugins/user-auth";
import { refreshOwnParking } from "../services/parking-totals";

const paramsSchema = z.object({ parkingId: z.uuid() });

export const parkingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireUser);

  app.post("/parkings/:parkingId/refresh", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const result = await refreshOwnParking(request.user.id, params.data.parkingId);
    if (typeof result === "string") {
      return reply.code(result === "not_found" ? 404 : 409).send({ error: result });
    }
    return { parking: result };
  });
};
