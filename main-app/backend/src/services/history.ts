import {
  decodeCursor,
  defaultCarDisplayName,
  encodeCursor,
  listPageSize,
  type HistoryEntry,
  type HistoryResponse,
} from "@parking/shared";
import { prisma } from "../db";

export async function listHistory(userId: string, cursor?: string): Promise<HistoryResponse> {
  const cars = await prisma.userVehicle.findMany({ where: { userId, status: "active" } });
  if (cars.length === 0) {
    return { parkings: [], nextCursor: null };
  }
  const carNames = new Map(cars.map((car) => [car.vehicleRegNumber, car.displayName ?? defaultCarDisplayName]));
  const after = cursor && decodeCursor(cursor);
  const found = await prisma.parking.findMany({
    where: {
      AND: [
        {
          OR: cars.map((car) => ({ vehicleRegNumber: car.vehicleRegNumber, createdAt: { gte: car.latestStatusChange } })),
        },
        after
          ? { OR: [{ createdAt: { lt: after.date } }, { createdAt: after.date, id: { lt: after.id } }] }
          : {},
      ],
    },
    include: { space: true, payments: { where: { status: "success" } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: listPageSize + 1,
  });
  const parkings = found.slice(0, listPageSize);
  const last = parkings.at(-1);

  return {
    nextCursor: found.length > listPageSize && last ? encodeCursor(last.createdAt, last.id) : null,
    parkings: parkings.map((parking): HistoryEntry => {
      const started = parking.status === "active" || parking.status === "finished";
      const payment = parking.payments[0];
      return {
        parkingId: parking.id,
        regNumber: parking.vehicleRegNumber,
        carName: carNames.get(parking.vehicleRegNumber) ?? defaultCarDisplayName,
        spaceName: parking.space.displayName,
        status: parking.status,
        date: (started ? parking.activeSince : parking.createdAt).toISOString(),
        payment:
          parking.status !== "finished"
            ? null
            : payment
              ? { status: "paid", total: payment.total, paidAt: payment.updatedAt.toISOString() }
              : { status: "unpaid" },
      };
    }),
  };
}
