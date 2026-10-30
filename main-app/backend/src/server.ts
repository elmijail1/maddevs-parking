import { buildApp } from "./app";
import { env } from "./env";
import { scheduleExistingBookings } from "./services/booking-jobs";
import { scheduleHourlyTotalsRefresh } from "./services/parking-totals";

const app = buildApp();

await app.listen({ port: env.MAIN_APP_PORT });
await scheduleExistingBookings(app.log);
scheduleHourlyTotalsRefresh(app.log);
