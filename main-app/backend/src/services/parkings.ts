import { calculateCharge, getRateTypeAt, lastRateBoundaryAtOrBefore } from "@parking/shared";
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
        return false;
      }
      await tx.parking.create({
        data: { status: parkingStatus, vehicleRegNumber: regNumber, spaceId: id, ...parkingTimesFrom(activeSince) },
      });
      return true;
    });
    if (claimed) {
      return id;
    }
  }
  return null;
}
