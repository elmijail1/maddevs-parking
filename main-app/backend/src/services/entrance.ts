import { bookingExpirationMinutes, getRateTypeAt, type NewEntranceResponse } from "@parking/shared";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db";
import { Prisma } from "../generated/prisma/client";

export async function allowEntrance(
  regNumber: string,
  log: FastifyBaseLogger,
  now = new Date(),
): Promise<NewEntranceResponse> {
  const spaces = await prisma.space.findMany({
    where: { OR: [{ relatedVehicle: regNumber }, { status: "vacant" }] },
    orderBy: { displayName: "asc" },
  });

  const occupiedSpaces = spaces.filter((s) => s.status === "occupied" && s.relatedVehicle === regNumber);
  if (occupiedSpaces.length > 0) {
    log.error(
      { critical: true, regNumber, spaceIds: occupiedSpaces.map((s) => s.id) },
      "Vehicle attempting to enter is already parked in the lot",
    );
    return { allowed: false, reason: "vehicle_already_inside" };
  }

  const bookedSpaces = spaces.filter((s) => s.status === "booked" && s.relatedVehicle === regNumber);
  if (bookedSpaces.length > 1) {
    log.error(
      { critical: true, regNumber, spaceIds: bookedSpaces.map((s) => s.id) },
      "Multiple spaces are booked for one vehicle",
    );
  }
  if (bookedSpaces.length > 0) {
    return { allowed: true };
  }

  for (const space of spaces.filter((s) => s.status === "vacant")) {
    if (await tryBookSpace(space.id, regNumber, now, log)) {
      return { allowed: true };
    }
  }
  return { allowed: false, reason: "no_available_spaces" };
}

async function tryBookSpace(spaceId: string, regNumber: string, now: Date, log: FastifyBaseLogger) {
  const activeSince = new Date(now.getTime() + bookingExpirationMinutes * 60_000);
  try {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.space.updateMany({
        where: { id: spaceId, status: "vacant" },
        data: { status: "booked", relatedVehicle: regNumber },
      });
      if (count === 0) {
        return false;
      }
      await tx.parking.create({
        data: {
          vehicleRegNumber: regNumber,
          spaceId,
          activeSince,
          currentRate: getRateTypeAt(activeSince),
          latestRateChange: activeSince,
          latestTotalUpdate: activeSince,
        },
      });
      return true;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      log.error(
        { critical: true, regNumber, spaceId },
        "Vehicle already has an open parking but no space is booked or occupied for it",
      );
    }
    throw error;
  }
}
