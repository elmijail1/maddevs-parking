import { listQuerySchema, type HistoryResponse } from "@parking/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireUser } from "../plugins/user-auth";
import { listHistory } from "../services/history";

export const historyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireUser);

  app.get("/history", async (request, reply): Promise<HistoryResponse | void> => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    return listHistory(request.user.id, query.data.cursor);
  });
};
