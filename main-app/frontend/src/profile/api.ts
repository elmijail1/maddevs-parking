import { authUserResponseSchema, type AuthUser, type ChangeEmailRequest, type ChangePasswordRequest } from "@parking/shared";
import { sendRequest } from "../api-request";

export async function changeEmail(body: ChangeEmailRequest): Promise<AuthUser> {
  return authUserResponseSchema.parse(await sendRequest("PATCH", "/api/profile/email", body)).user;
}

export async function changePassword(body: ChangePasswordRequest) {
  await sendRequest("PATCH", "/api/profile/password", body);
}

export async function logOut() {
  await sendRequest("POST", "/api/auth/logout");
}
