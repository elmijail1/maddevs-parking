import { loginRequestSchema, signupRequestSchema, type AuthUserResponse } from "@parking/shared";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db";
import { Prisma } from "../generated/prisma/client";
import { clearAuthCookie, requireUser, setAuthCookie } from "../plugins/user-auth";
import { hashPassword, verifyAgainstNothing, verifyPassword } from "../services/passwords";

const toAuthUser = ({ id, email }: { id: string; email: string }): AuthUserResponse => ({ user: { id, email } });

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/signup", async (request, reply) => {
    const parsed = signupRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    try {
      const user = await prisma.user.create({
        data: { email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password) },
      });
      await setAuthCookie(reply, user.id);
      return reply.code(201).send(toAuthUser(user));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send({ error: "email_taken" });
      }
      throw error;
    }
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const valid = user
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : await verifyAgainstNothing(parsed.data.password);
    if (!user || !valid) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    await setAuthCookie(reply, user.id);
    return toAuthUser(user);
  });

  app.get("/auth/me", { onRequest: requireUser }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.id } });
    if (!user) {
      clearAuthCookie(reply);
      return reply.code(401).send({ error: "unauthorized" });
    }
    return toAuthUser(user);
  });
};
