import { changeEmailRequestSchema, changePasswordRequestSchema } from "@parking/shared";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db";
import { Prisma } from "../generated/prisma/client";
import { clearAuthCookie, requireUser } from "../plugins/user-auth";
import { hashPassword, verifyPassword } from "../services/passwords";
import { toAuthUser } from "./auth";

async function findUserWithPassword(request: FastifyRequest, reply: FastifyReply, currentPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: request.user.id } });
  if (!user) {
    clearAuthCookie(reply);
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    reply.code(403).send({ error: "wrong_password" });
    return null;
  }
  return user;
}

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireUser);

  app.patch("/profile/email", async (request, reply) => {
    const parsed = changeEmailRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const user = await findUserWithPassword(request, reply, parsed.data.currentPassword);
    if (!user) {
      return reply;
    }
    try {
      const updated = await prisma.user.update({ where: { id: user.id }, data: { email: parsed.data.email } });
      return toAuthUser(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send({ error: "email_taken" });
      }
      throw error;
    }
  });

  app.patch("/profile/password", async (request, reply) => {
    const parsed = changePasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const user = await findUserWithPassword(request, reply, parsed.data.currentPassword);
    if (!user) {
      return reply;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword) },
    });
    return reply.code(204).send();
  });
};
