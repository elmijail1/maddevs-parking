import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { createTestApp, resetDatabase, signUp, testPassword } from "./helpers";

const { app } = createTestApp();
const email = "driver@example.com";
const newPassword = "Better34#";
let cookie: string;

const patch = (url: string, payload: unknown, headers: Record<string, string> = { cookie }) =>
  app.inject({ method: "PATCH", url, headers, payload: payload as object });
const logIn = (loginEmail: string, password: string) =>
  app.inject({ method: "POST", url: "/api/auth/login", payload: { email: loginEmail, password } });
const currentUser = () => prisma.user.findUniqueOrThrow({ where: { email } });

beforeEach(async () => {
  await resetDatabase();
  cookie = await signUp(app, email);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/auth/logout", () => {
  it("clears the token cookie", async () => {
    const response = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });

    expect(response.statusCode).toBe(204);
    expect(response.cookies.find((c) => c.name === "token")).toMatchObject({ value: "", path: "/" });
  });
});

describe("PATCH /api/profile/email", () => {
  it("changes the email of the logged-in user only, normalizing it", async () => {
    await signUp(app, "other@example.com");
    const { id } = await currentUser();

    const response = await patch("/api/profile/email", { email: " New@Example.com ", currentPassword: testPassword });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: { id, email: "new@example.com" } });
    expect(await prisma.user.findUnique({ where: { id } })).toMatchObject({ email: "new@example.com" });
    expect(await prisma.user.findUnique({ where: { email: "other@example.com" } })).not.toBeNull();
    expect((await logIn("new@example.com", testPassword)).statusCode).toBe(200);
  });

  it("rejects an email another user already uses and keeps the old one", async () => {
    await signUp(app, "taken@example.com");

    const response = await patch("/api/profile/email", { email: "TAKEN@example.com", currentPassword: testPassword });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "email_taken" });
    expect(await prisma.user.findUnique({ where: { email } })).not.toBeNull();
  });

  it("rejects a wrong current password", async () => {
    const response = await patch("/api/profile/email", { email: "new@example.com", currentPassword: "Wrong123!" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "wrong_password" });
    expect(await prisma.user.findUnique({ where: { email } })).not.toBeNull();
  });

  it.each([
    ["an empty email", { email: " ", currentPassword: testPassword }],
    ["an invalid email", { email: "new@", currentPassword: testPassword }],
    ["a too long email", { email: `${"a".repeat(89)}@example.com`, currentPassword: testPassword }],
    ["no current password", { email: "new@example.com" }],
    ["an empty current password", { email: "new@example.com", currentPassword: "" }],
  ])("rejects %s", async (_, body) => {
    const response = await patch("/api/profile/email", body);

    expect(response.statusCode).toBe(400);
    expect(await prisma.user.findUnique({ where: { email } })).not.toBeNull();
  });

  it("can't be called without logging in, even with a user id in the body", async () => {
    const { id } = await currentUser();

    const response = await patch("/api/profile/email", { id, email: "new@example.com", currentPassword: testPassword }, {});

    expect(response.statusCode).toBe(401);
    expect(await prisma.user.findUnique({ where: { email } })).not.toBeNull();
  });
});

describe("PATCH /api/profile/password", () => {
  it("changes the password: the new one works, the old one doesn't", async () => {
    const before = (await currentUser()).passwordHash;

    const response = await patch("/api/profile/password", { currentPassword: testPassword, newPassword });

    expect(response.statusCode).toBe(204);
    const after = (await currentUser()).passwordHash;
    expect(after).not.toBe(before);
    expect(after).not.toContain(newPassword);
    expect((await logIn(email, newPassword)).statusCode).toBe(200);
    expect((await logIn(email, testPassword)).statusCode).toBe(401);
  });

  it("rejects a wrong current password", async () => {
    const response = await patch("/api/profile/password", { currentPassword: "Wrong123!", newPassword });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "wrong_password" });
    expect((await logIn(email, testPassword)).statusCode).toBe(200);
  });

  it.each([
    ["an empty new password", ""],
    ["a too short new password", "Ab1!"],
    ["a too long new password", `Ab1!${"x".repeat(27)}`],
    ["a new password without a special character", "Secret12"],
    ["a new password with a non-Latin letter", "Sécret12!"],
  ])("rejects %s", async (_, password) => {
    const response = await patch("/api/profile/password", { currentPassword: testPassword, newPassword: password });

    expect(response.statusCode).toBe(400);
    expect((await logIn(email, testPassword)).statusCode).toBe(200);
  });

  it("can't be called without logging in", async () => {
    const response = await patch("/api/profile/password", { currentPassword: testPassword, newPassword }, {});

    expect(response.statusCode).toBe(401);
  });
});
