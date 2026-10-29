import Fastify, { type FastifyServerOptions } from "fastify";
import { deviceRoutes } from "./routes/devices";
import { spaceRoutes } from "./routes/spaces";

export function buildApp(options: FastifyServerOptions = { logger: true }) {
  const app = Fastify({ forceCloseConnections: true, ...options });
  app.register(deviceRoutes, { prefix: "/api" });
  app.register(spaceRoutes, { prefix: "/api" });
  return app;
}
