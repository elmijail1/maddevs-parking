import {
  paymentResultGraceSeconds,
  paymentSessionTimeoutMinutes,
  type PaymentResultStatus,
  type PaymentStatus,
} from "@parking/shared";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db";
import type { Payment } from "../generated/prisma/client";

const paymentStaleAfterMs = paymentSessionTimeoutMinutes * 60_000 + paymentResultGraceSeconds * 1000;

export async function cancelIfStale(payment: Payment, log: FastifyBaseLogger, now = new Date()) {
  if (payment.status !== "pending" || now.getTime() - payment.createdAt.getTime() < paymentStaleAfterMs) {
    return payment;
  }
  const { count } = await prisma.payment.updateMany({
    where: { id: payment.id, status: "pending" },
    data: { status: "cancelled" },
  });
  if (count > 0) {
    log.warn({ paymentId: payment.id }, "Payment got no result from the terminal in time and was cancelled");
  }
  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
}

export async function getPaymentStatus(
  paymentId: string,
  log: FastifyBaseLogger,
  now = new Date(),
): Promise<PaymentStatus | null> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  return payment ? (await cancelIfStale(payment, log, now)).status : null;
}

export async function completePayment(paymentId: string, status: PaymentResultStatus, log: FastifyBaseLogger) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    log.warn({ paymentId, status }, "Terminal reported a result for an unknown payment");
    return "not_found";
  }

  const completed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { id: paymentId, status: "pending" },
      data: { status },
    });
    if (count === 0) {
      return false;
    }
    if (status === "success") {
      await tx.parking.update({ where: { id: payment.parkingId }, data: { status: "finished" } });
    }
    return true;
  });

  const context = { paymentId, parkingId: payment.parkingId, status };
  if (!completed) {
    const message = "Terminal reported a result for a payment that is no longer pending, ignored";
    if (status === "success") {
      log.error({ critical: true, ...context, currentStatus: payment.status }, message);
    } else {
      log.warn({ ...context, currentStatus: payment.status }, message);
    }
    return "ignored";
  }

  if (status === "cancelled") {
    log.warn(context, "Payment was cancelled at the terminal");
  }
  if (status === "failed") {
    log.error({ critical: true, ...context }, "Payment failed at the terminal");
  }
  return "completed";
}
