import Fastify, { type FastifyServerOptions } from "fastify";
import { registerUserAuth } from "./plugins/user-auth";
import { authRoutes } from "./routes/auth";
import { bookingRoutes } from "./routes/bookings";
import { carRoutes } from "./routes/cars";
import { deviceRoutes } from "./routes/devices";
import { historyRoutes } from "./routes/history";
import { parkingRoutes } from "./routes/parkings";
import { profileRoutes } from "./routes/profile";
import { spaceRoutes } from "./routes/spaces";
import { cancelAllJobs } from "./services/scheduler";

export function buildApp(options: FastifyServerOptions = { logger: true }) {
  const app = Fastify({ forceCloseConnections: true, ...options });
  registerUserAuth(app);
  app.addHook("onClose", async () => cancelAllJobs());
  app.register(deviceRoutes, { prefix: "/api" });
  app.register(authRoutes, { prefix: "/api" });
  app.register(profileRoutes, { prefix: "/api" });
  app.register(carRoutes, { prefix: "/api" });
  app.register(bookingRoutes, { prefix: "/api" });
  app.register(parkingRoutes, { prefix: "/api" });
  app.register(historyRoutes, { prefix: "/api" });
  app.register(spaceRoutes, { prefix: "/api" });
  return app;
}
