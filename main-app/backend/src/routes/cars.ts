import { addCarRequestSchema, updateCarRequestSchema, type CarResponse, type CarsResponse } from "@parking/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUser } from "../plugins/user-auth";
import { addCar, listCars, removeCar, renameCar } from "../services/cars";

const carParamsSchema = z.object({ id: z.uuid() });

export const carRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireUser);

  app.get("/cars", async (request): Promise<CarsResponse> => ({ cars: await listCars(request.user.id) }));

  app.post("/cars", async (request, reply) => {
    const parsed = addCarRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const result = await addCar(request.user.id, parsed.data);
    if ("error" in result) {
      return reply.code(409).send(result);
    }
    return reply.code(201).send(result satisfies CarResponse);
  });

  app.patch("/cars/:id", async (request, reply) => {
    const params = carParamsSchema.safeParse(request.params);
    const body = updateCarRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const car = await renameCar(request.user.id, params.data.id, body.data.displayName);
    if (!car) {
      return reply.code(404).send({ error: "not_found" });
    }
    return { car } satisfies CarResponse;
  });

  app.delete("/cars/:id", async (request, reply) => {
    const params = carParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const removed = await removeCar(request.user.id, params.data.id);
    return reply.code(removed ? 204 : 404).send(removed ? undefined : { error: "not_found" });
  });
};
