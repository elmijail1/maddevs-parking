import {
  authErrorSchema,
  authUserResponseSchema,
  type AuthError,
  type AuthUser,
  type LoginRequest,
  type SignupRequest,
} from "@parking/shared";

export const currentUserQueryKey = ["currentUser"];

export class AuthRequestError extends Error {
  constructor(public code: AuthError | "unknown") {
    super(`Authentication request failed: ${code}`);
  }
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/me");
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load the current user: ${response.status}`);
  }
  return authUserResponseSchema.parse(await response.json()).user;
}

async function postCredentials(url: string, body: LoginRequest | SignupRequest): Promise<AuthUser> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = authErrorSchema.safeParse(data);
    throw new AuthRequestError(parsed.success ? parsed.data.error : "unknown");
  }
  return authUserResponseSchema.parse(data).user;
}

export const logIn = (body: LoginRequest) => postCredentials("/api/auth/login", body);
export const signUp = (body: SignupRequest) => postCredentials("/api/auth/signup", body);
