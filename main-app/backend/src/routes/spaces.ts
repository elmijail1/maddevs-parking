import { heartbeatEventName, liveHeartbeatSeconds, spacesEventName, type SpacesResponse } from "@parking/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireUser } from "../plugins/user-auth";
import { listSpaces, subscribeToSpaces } from "../services/spaces";

export const spaceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireUser);

  app.get("/spaces", async (): Promise<SpacesResponse> => listSpaces());

  app.get("/spaces/events", (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    reply.raw.write("retry: 3000\n\n");

    const unsubscribe = subscribeToSpaces(
      (data) => reply.raw.write(`event: ${spacesEventName}\ndata: ${data}\n\n`),
      request.log,
    );
    const heartbeat = setInterval(
      () => reply.raw.write(`event: ${heartbeatEventName}\ndata: {}\n\n`),
      liveHeartbeatSeconds * 1000,
    );

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
};
