import {
  newEntranceRequestSchema,
  newExitRequestSchema,
  newParkingRequestSchema,
  paymentResultRequestSchema,
  type NewEntranceResponse,
  type NewExitResponse,
  type PaymentStatusResponse,
} from "@parking/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireServiceApiKey } from "../plugins/service-auth";
import { allowEntrance } from "../services/entrance";
import { startExit } from "../services/exit";
import { handleNewParking, resolveEntranceTime } from "../services/new-parking";
import { completePayment, getPaymentStatus } from "../services/payments";

const looseBodySchema = z.record(z.string(), z.unknown()).catch({});
const paymentParamsSchema = z.object({ paymentId: z.uuid() });

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

  app.post("/new-exit", async (request, reply): Promise<NewExitResponse | void> => {
    const parsed = newExitRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    return startExit(parsed.data.regNumber, request.log);
  });

  app.post("/payment-result", async (request, reply) => {
    const parsed = paymentResultRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      request.log.error({ critical: true, body: request.body }, "Terminal sent an invalid payment result");
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const result = await completePayment(parsed.data.paymentId, parsed.data.status, request.log);
    return reply.code(result === "not_found" ? 404 : 204).send();
  });

  app.get("/payments/:paymentId", async (request, reply): Promise<PaymentStatusResponse | void> => {
    const parsed = paymentParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const status = await getPaymentStatus(parsed.data.paymentId, request.log);
    if (!status) {
      return reply.code(404).send({ error: "not_found" });
    }
    return { status };
  });
};
