import type { PaymentSessionRequest } from "@parking/shared";
import { env } from "../env";

export async function sendToPaymentTerminal(session: PaymentSessionRequest) {
  const response = await fetch(new URL("/sessions", env.PAYMENT_TERMINAL_URL), {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.SERVICE_API_KEY },
    body: JSON.stringify(session),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Payment terminal responded with ${response.status}`);
  }
}
