import type { SendEmailRequest } from "@parking/shared";
import { env } from "../env";

export async function sendEmail(email: SendEmailRequest) {
  const response = await fetch(new URL("/emails", env.EMAIL_SERVICE_URL), {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.SERVICE_API_KEY },
    body: JSON.stringify(email),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Email service responded with ${response.status}`);
  }
}
