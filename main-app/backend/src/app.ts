import Fastify, { type FastifyServerOptions } from "fastify";
import { registerUserAuth } from "./plugins/user-auth";
import { authRoutes } from "./routes/auth";
import { bookingRoutes } from "./routes/bookings";
import { carRoutes } from "./routes/cars";
import { deviceRoutes } from "./routes/devices";
import { profileRoutes } from "./routes/profile";
import { spaceRoutes } from "./routes/spaces";

export function buildApp(options: FastifyServerOptions = { logger: true }) {
  const app = Fastify({ forceCloseConnections: true, ...options });
  registerUserAuth(app);
  app.register(deviceRoutes, { prefix: "/api" });
  app.register(authRoutes, { prefix: "/api" });
  app.register(profileRoutes, { prefix: "/api" });
  app.register(carRoutes, { prefix: "/api" });
  app.register(bookingRoutes, { prefix: "/api" });
  app.register(spaceRoutes, { prefix: "/api" });
  return app;
}
