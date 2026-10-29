import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { createTestApp, resetDatabase, signUp, testPassword } from "./helpers";

const { app } = createTestApp();
const email = "driver@example.com";
const dayMs = 24 * 60 * 60 * 1000;

const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, payload: payload as object });
const getMe = (cookie?: string) =>
  app.inject({ method: "GET", url: "/api/auth/me", headers: cookie ? { cookie } : {} });
const tokenCookie = <T extends { name: string }>(response: { cookies: T[] }) => response.cookies.find((c) => c.name === "token");

function forgeToken(payload: object, secret: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/auth/signup", () => {
  it("creates a user with a hashed password and logs them in", async () => {
    const response = await post("/api/auth/signup", { email: "  Driver@Example.COM ", password: testPassword });

    expect(response.statusCode).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(response.json()).toEqual({ user: { id: user.id, email } });
    expect(user.passwordHash).not.toContain(testPassword);
    expect(user.passwordHash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);

    expect(tokenCookie(response)).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
    expect(tokenCookie(response)).not.toHaveProperty("secure");
  });

  it("salts every hash, so equal passwords get different hashes", async () => {
    await signUp(app, "first@example.com");
    await signUp(app, "second@example.com");

    const [first, second] = await prisma.user.findMany();
    expect(first!.passwordHash).not.toBe(second!.passwordHash);
  });

  it("rejects an email that is already in use, in any letter case", async () => {
    await signUp(app, email);

    const response = await post("/api/auth/signup", { email: "DRIVER@example.com", password: "Other123?" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "email_taken" });
    expect(tokenCookie(response)).toBeUndefined();
    expect(await prisma.user.count()).toBe(1);
  });

  it.each([
    ["no body", undefined],
    ["a missing password", { email }],
    ["a non-string email", { email: 42, password: testPassword }],
    ["an invalid email", { email: "driver@", password: testPassword }],
    ["a too long email", { email: `${"a".repeat(89)}@example.com`, password: testPassword }],
    ["a too short password", { email, password: "Ab1!" }],
    ["a too long password", { email, password: `Ab1!${"x".repeat(27)}` }],
    ["a password without a digit", { email, password: "Secret!!" }],
    ["a password without a letter", { email, password: "1234567!" }],
    ["a password without a special character", { email, password: "Secret12" }],
    ["a password with a space", { email, password: "Secret 12!" }],
    ["a password with a non-Latin letter", { email, password: "Sécret12!" }],
  ])("rejects %s without creating a user", async (_, body) => {
    const response = await post("/api/auth/signup", body);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_request" });
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await signUp(app, email);
  });

  it("logs a user in with the right credentials, ignoring the email's case and spaces", async () => {
    const response = await post("/api/auth/login", { email: " DRIVER@example.com", password: testPassword });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: { id: expect.any(String), email } });
    expect((await getMe(`token=${tokenCookie(response)!.value}`)).statusCode).toBe(200);
  });

  it.each([
    ["a wrong password", { email, password: "Wrong123!" }],
    ["an unknown email", { email: "nobody@example.com", password: testPassword }],
  ])("answers the same way to %s", async (_, body) => {
    const response = await post("/api/auth/login", body);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_credentials" });
    expect(tokenCookie(response)).toBeUndefined();
  });

  it.each([
    ["no body", undefined],
    ["an empty email", { email: " ", password: testPassword }],
    ["an empty password", { email, password: "" }],
    ["a too long password", { email, password: "x".repeat(31) }],
    ["a non-string password", { email, password: 12345678 }],
  ])("rejects %s", async (_, body) => {
    const response = await post("/api/auth/login", body);

    expect(response.statusCode).toBe(400);
    expect(tokenCookie(response)).toBeUndefined();
  });
});

describe("GET /api/auth/me", () => {
  it("returns the logged-in user", async () => {
    const cookie = await signUp(app, email);

    const response = await getMe(cookie);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: { id: expect.any(String), email } });
  });

  it.each([
    ["no token", undefined],
    ["a malformed token", "token=abc.def.ghi"],
    ["a token signed with another secret", `token=${forgeToken({ sub: crypto.randomUUID() }, "another-secret-another-secret-123")}`],
  ])("rejects %s", async (_, cookie) => {
    expect((await getMe(cookie)).statusCode).toBe(401);
  });

  it("ignores a valid token sent in the Authorization header", async () => {
    const token = (await signUp(app, email)).slice("token=".length);

    const response = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(401);
  });

  it("accepts a token for 14 days and rejects it after that", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    const cookie = await signUp(app, email);

    vi.setSystemTime(new Date(Date.now() + 14 * dayMs - 60_000));
    expect((await getMe(cookie)).statusCode).toBe(200);

    vi.setSystemTime(new Date(Date.now() + 2 * 60_000));
    expect((await getMe(cookie)).statusCode).toBe(401);
  });

  it("rejects the token of a user that no longer exists and clears the cookie", async () => {
    const cookie = await signUp(app, email);
    await prisma.user.deleteMany();

    const response = await getMe(cookie);

    expect(response.statusCode).toBe(401);
    expect(tokenCookie(response)).toMatchObject({ value: "" });
  });
});
