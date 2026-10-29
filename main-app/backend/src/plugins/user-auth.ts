import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, onRequestAsyncHookHandler } from "fastify";
import { env } from "../env";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { id: string };
  }
}

export const authCookieName = "token";
const tokenLifetimeSeconds = 14 * 24 * 60 * 60;

export function registerUserAuth(app: FastifyInstance) {
  app.register(fastifyCookie);
  app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: authCookieName, signed: false },
    sign: { expiresIn: tokenLifetimeSeconds },
    formatUser: (payload) => ({ id: payload.sub }),
  });
}

export async function setAuthCookie(reply: FastifyReply, userId: string) {
  const token = await reply.jwtSign({ sub: userId });
  reply.setCookie(authCookieName, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: tokenLifetimeSeconds,
  });
}

export function clearAuthCookie(reply: FastifyReply) {
  reply.clearCookie(authCookieName, { path: "/" });
}

export const requireUser: onRequestAsyncHookHandler = async (request, reply) => {
  try {
    await request.jwtVerify({ onlyCookie: true });
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
};
