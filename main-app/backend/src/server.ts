import { buildApp } from "./app";
import { env } from "./env";

const app = buildApp();

await app.listen({ port: env.MAIN_APP_PORT });
