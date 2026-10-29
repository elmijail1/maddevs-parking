import {
  formatCents,
  paymentResultStatusSchema,
  paymentSessionRequestSchema,
  paymentSessionTimeoutMinutes,
  type PaymentResultStatus,
  type PaymentSessionRequest,
} from "@parking/shared";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createInterface } from "node:readline";
import { env } from "./env";

type Session = PaymentSessionRequest & { timeout: NodeJS.Timeout };

let session: Session | null = null;

function prompt() {
  console.log(
    session
      ? `Type the payment result (${paymentResultStatusSchema.options.join(" / ")}):`
      : "Waiting for a payment session...",
  );
}

async function reportResult(paymentId: string, status: PaymentResultStatus) {
  try {
    const response = await fetch(new URL("/api/payment-result", env.MAIN_APP_URL), {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.SERVICE_API_KEY },
      body: JSON.stringify({ paymentId, status }),
      signal: AbortSignal.timeout(5000),
    });
    console.log(
      response.ok
        ? `Reported "${status}" to the main app`
        : `Main app rejected the result (${response.status}): ${await response.text()}`,
    );
  } catch (error) {
    console.error(`Couldn't report the result: ${error instanceof Error ? error.message : error}`);
  }
}

async function finishSession(status: PaymentResultStatus) {
  if (!session) {
    return;
  }
  const { paymentId, timeout } = session;
  clearTimeout(timeout);
  session = null;
  await reportResult(paymentId, status);
  prompt();
}

function startSession(request: PaymentSessionRequest) {
  if (session) {
    clearTimeout(session.timeout);
    console.log(`Session for payment ${session.paymentId} was dropped for a new one`);
  }
  const timeout = setTimeout(() => {
    console.log(`No input for ${paymentSessionTimeoutMinutes} minutes, cancelling the payment`);
    void finishSession("cancelled");
  }, paymentSessionTimeoutMinutes * 60_000);
  session = { ...request, timeout };
  console.log(`\nNew payment session: ${formatCents(request.total)} (payment ${request.paymentId})`);
  prompt();
}

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
  if (request.method !== "POST" || request.url !== "/sessions") {
    return send(response, 404, { error: "not_found" });
  }
  if (request.headers["x-api-key"] !== env.SERVICE_API_KEY) {
    return send(response, 401, { error: "unauthorized" });
  }
  const parsed = paymentSessionRequestSchema.safeParse(await readJson(request).catch(() => null));
  if (!parsed.success) {
    return send(response, 400, { error: "invalid_request" });
  }
  startSession(parsed.data);
  send(response, 202, { accepted: true });
});

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!session) {
    console.log("There's no payment session right now");
    return;
  }
  const status = paymentResultStatusSchema.safeParse(line.trim().toLowerCase());
  if (!status.success) {
    prompt();
    return;
  }
  void finishSession(status.data);
});

server.listen(env.PAYMENT_TERMINAL_PORT, () => {
  console.log(`Payment terminal is listening on port ${env.PAYMENT_TERMINAL_PORT}`);
  prompt();
});
