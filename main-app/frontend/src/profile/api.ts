import {
  authErrorSchema,
  authUserResponseSchema,
  type AuthError,
  type AuthUser,
  type ChangeEmailRequest,
  type ChangePasswordRequest,
} from "@parking/shared";
import { UnauthorizedError } from "../api-errors";

const requestTimeoutMs = 10_000;

export class ProfileRequestError extends Error {
  constructor(public code: AuthError | "unknown") {
    super(`Profile request failed: ${code}`);
  }
}

async function sendProfileRequest(method: "PATCH" | "POST", url: string, body?: object) {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch {
    throw new ProfileRequestError("unknown");
  }
  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  const data: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = authErrorSchema.safeParse(data);
    throw new ProfileRequestError(parsed.success ? parsed.data.error : "unknown");
  }
  return data;
}

export async function changeEmail(body: ChangeEmailRequest): Promise<AuthUser> {
  return authUserResponseSchema.parse(await sendProfileRequest("PATCH", "/api/profile/email", body)).user;
}

export async function changePassword(body: ChangePasswordRequest) {
  await sendProfileRequest("PATCH", "/api/profile/password", body);
}

export async function logOut() {
  await sendProfileRequest("POST", "/api/auth/logout");
}
