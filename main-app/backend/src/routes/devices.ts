import { newEntranceRequestSchema, newParkingRequestSchema, type NewEntranceResponse } from "@parking/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireServiceApiKey } from "../plugins/service-auth";
import { allowEntrance } from "../services/entrance";
import { handleNewParking, resolveEntranceTime } from "../services/new-parking";

const looseBodySchema = z.record(z.string(), z.unknown()).catch({});

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireServiceApiKey);

  app.post("/new-entrance", async (request, reply): Promise<NewEntranceResponse | void> => {
    const parsed = newEntranceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    return allowEntrance(parsed.data.regNumber, request.log);
  });

  app.post("/new-parking", async (request, reply) => {
    const body = looseBodySchema.parse(request.body);
    const regNumber = newParkingRequestSchema.shape.regNumber.safeParse(body.regNumber);
    if (!regNumber.success) {
      request.log.error({ critical: true, body: request.body }, "Vehicle entered with an invalid registration number");
      return reply.code(400).send({ error: "invalid_request", issues: regNumber.error.issues });
    }
    const time = resolveEntranceTime(body.time, request.log);
    const result = await handleNewParking(regNumber.data, time, request.log);
    return reply.code(result === "no_space" ? 409 : 204).send();
  });
};
