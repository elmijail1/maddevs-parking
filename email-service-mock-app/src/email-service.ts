import { sendEmailRequestSchema } from "@parking/shared";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { env } from "./env";

const deliveryDelayMs = 1000;

async function readJson(request: IncomingMessage) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return JSON.parse(body);
}

function send(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/emails") {
    return send(response, 404, { error: "not_found" });
  }
  if (request.headers["x-api-key"] !== env.SERVICE_API_KEY) {
    return send(response, 401, { error: "unauthorized" });
  }
  const parsed = sendEmailRequestSchema.safeParse(await readJson(request).catch(() => null));
  if (!parsed.success) {
    return send(response, 400, { error: "invalid_request" });
  }
  await sleep(deliveryDelayMs);
  const { to, subject, text } = parsed.data;
  console.log(`\n[${new Date().toISOString()}] Email to ${to}\nSubject: ${subject}\n${text}`);
  send(response, 200, { status: "sent" });
});

server.listen(env.EMAIL_SERVICE_PORT, () => {
  console.log(`Email service is listening on port ${env.EMAIL_SERVICE_PORT}`);
});
