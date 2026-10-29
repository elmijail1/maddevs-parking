import { z } from "zod";
import { UnauthorizedError } from "./api-errors";

const requestTimeoutMs = 10_000;
const errorBodySchema = z.object({ error: z.string() });

export class ApiRequestError extends Error {
  constructor(public code: string) {
    super(`Request failed: ${code}`);
  }
}

export async function sendRequest(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: object) {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch {
    throw new ApiRequestError("unknown");
  }
  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  const data: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(data);
    throw new ApiRequestError(parsed.success ? parsed.data.error : "unknown");
  }
  return data;
}
