import { bookSpaceRequestSchema, type BookingResponse, type MyParkingsResponse } from "@parking/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUser } from "../plugins/user-auth";
import { bookSpace, cancelBooking, listMyParkings } from "../services/bookings";
import { notifySpacesChanged } from "../services/spaces";

const errorStatus = { space_unavailable: 409, vehicle_busy: 409, car_not_found: 404 } as const;
const cancelParamsSchema = z.object({ parkingId: z.uuid() });

export const bookingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireUser);

  app.post("/bookings", async (request, reply) => {
    const parsed = bookSpaceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const result = await bookSpace(request.user.id, parsed.data.spaceId, parsed.data.carId);
    if ("error" in result) {
      return reply.code(errorStatus[result.error]).send(result);
    }
    notifySpacesChanged(request.log);
    return reply.code(201).send(result satisfies BookingResponse);
  });

  app.post("/bookings/:parkingId/cancel", async (request, reply) => {
    const params = cancelParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const result = await cancelBooking(request.user.id, params.data.parkingId, request.log);
    if (result !== "cancelled") {
      return reply.code(result === "not_found" ? 404 : 409).send({ error: result });
    }
    notifySpacesChanged(request.log);
    return reply.code(204).send();
  });

  app.get("/my-parkings", async (request): Promise<MyParkingsResponse> => ({
    parkings: await listMyParkings(request.user.id),
  }));
};
