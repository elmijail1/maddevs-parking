import type { NewExitResponse } from "@parking/shared";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db";
import { refreshParkingTotals } from "./parkings";
import { sendToPaymentTerminal } from "./payment-terminal";
import { cancelIfStale } from "./payments";

export async function startExit(regNumber: string, log: FastifyBaseLogger, now = new Date()): Promise<NewExitResponse> {
  const parking = await prisma.parking.findFirst({
    where: { vehicleRegNumber: regNumber, status: "active" },
    include: { payments: { where: { status: "pending" } } },
  });
  if (!parking) {
    log.error({ critical: true, regNumber }, "Vehicle attempting to exit has no active parking");
    return { status: "denied", reason: "no_active_parking" };
  }

  const existingPayment = parking.payments[0] && (await cancelIfStale(parking.payments[0], log, now));
  if (existingPayment?.status === "pending") {
    return { status: "awaiting_payment", paymentId: existingPayment.id, total: existingPayment.total };
  }

  const { count } = await prisma.payment.updateMany({
    where: { status: "pending", parkingId: { not: parking.id } },
    data: { status: "cancelled" },
  });
  if (count > 0) {
    log.warn({ regNumber, cancelledPayments: count }, "Other vehicles' pending payments were cancelled in favor of this exit");
  }

  const payment = await prisma.$transaction(async (tx) => {
    const { total } = await tx.parking.update({
      where: { id: parking.id },
      data: refreshParkingTotals(parking, now),
    });
    return tx.payment.create({ data: { parkingId: parking.id, total, createdAt: now } });
  });

  try {
    await sendToPaymentTerminal({ paymentId: payment.id, total: payment.total });
  } catch (error) {
    await prisma.payment.updateMany({ where: { id: payment.id, status: "pending" }, data: { status: "failed" } });
    log.error({ critical: true, regNumber, paymentId: payment.id, err: error }, "Payment terminal is unreachable, the payment failed");
    return { status: "denied", reason: "terminal_unavailable" };
  }
  return { status: "awaiting_payment", paymentId: payment.id, total: payment.total };
}
