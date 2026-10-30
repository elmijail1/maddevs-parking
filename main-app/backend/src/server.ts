import { buildApp } from "./app";
import { env } from "./env";
import { scheduleExistingBookings } from "./services/booking-jobs";

const app = buildApp();

await app.listen({ port: env.MAIN_APP_PORT });
await scheduleExistingBookings(app.log);
