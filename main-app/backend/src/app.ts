import Fastify, { type FastifyServerOptions } from "fastify";
import { deviceRoutes } from "./routes/devices";

export function buildApp(options: FastifyServerOptions = { logger: true }) {
  const app = Fastify(options);
  app.register(deviceRoutes, { prefix: "/api" });
  return app;
}
