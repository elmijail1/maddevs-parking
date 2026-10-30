import { calculateCharge, getRateTypeAt, lastRateBoundaryAtOrBefore } from "@parking/shared";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db";
import type { Parking } from "../generated/prisma/client";

export function parkingTimesFrom(activeSince: Date) {
  return {
    activeSince,
    currentRate: getRateTypeAt(activeSince),
    latestRateChange: activeSince,
    latestTotalUpdate: activeSince,
  };
}

export function refreshParkingTotals(
  parking: Pick<Parking, "total" | "latestTotalUpdate" | "currentRate" | "latestRateChange">,
  now: Date,
) {
  const { totalCents, chargedUntil } = calculateCharge(parking.latestTotalUpdate, now);
  const currentRate = getRateTypeAt(now);
  return {
    total: parking.total + totalCents,
    latestTotalUpdate: chargedUntil,
    currentRate,
    latestRateChange: currentRate === parking.currentRate ? parking.latestRateChange : lastRateBoundaryAtOrBefore(now),
  };
}

const claimModes = {
  book: { spaceStatus: "booked", parkingStatus: "booked" },
  occupy: { spaceStatus: "occupied", parkingStatus: "active" },
} as const;

export async function claimVacantSpace(regNumber: string, mode: keyof typeof claimModes, activeSince: Date) {
  const { spaceStatus, parkingStatus } = claimModes[mode];
  const vacantSpaces = await prisma.space.findMany({
    where: { status: "vacant" },
    orderBy: { displayName: "asc" },
    select: { id: true },
  });

  for (const { id } of vacantSpaces) {
    const claimed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.space.updateMany({
        where: { id, status: "vacant" },
        data: { status: spaceStatus, relatedVehicle: regNumber },
      });
      if (count === 0) {
        return null;
      }
      return tx.parking.create({
        data: { status: parkingStatus, vehicleRegNumber: regNumber, spaceId: id, ...parkingTimesFrom(activeSince) },
      });
    });
    if (claimed) {
      return claimed;
    }
  }
  return null;
}

export async function cancelBookedParking(parkingId: string, log: FastifyBaseLogger) {
  return prisma.$transaction(async (tx) => {
    const parking = await tx.parking.findUnique({ where: { id: parkingId } });
    const { count } = await tx.parking.updateMany({
      where: { id: parkingId, status: "booked" },
      data: { status: "cancelled" },
    });
    if (!parking || count === 0) {
      return "booking_not_active" as const;
    }
    const freed = await tx.space.updateMany({
      where: { id: parking.spaceId, status: "booked", relatedVehicle: parking.vehicleRegNumber },
      data: { status: "vacant", relatedVehicle: null },
    });
    if (freed.count === 0) {
      log.warn(
        { parkingId, spaceId: parking.spaceId, regNumber: parking.vehicleRegNumber },
        "Cancelled booking's space wasn't booked for its vehicle, the space was left as it is",
      );
    }
    return "cancelled" as const;
  });
}
