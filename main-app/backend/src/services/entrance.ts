import { bookingExpirationMinutes, type NewEntranceResponse } from "@parking/shared";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db";
import { Prisma } from "../generated/prisma/client";
import { claimVacantSpace } from "./parkings";

export async function allowEntrance(
  regNumber: string,
  log: FastifyBaseLogger,
  now = new Date(),
): Promise<NewEntranceResponse> {
  const ownSpaces = await prisma.space.findMany({
    where: { relatedVehicle: regNumber, status: { in: ["booked", "occupied"] } },
    orderBy: { displayName: "asc" },
  });

  const occupiedSpaces = ownSpaces.filter((s) => s.status === "occupied");
  if (occupiedSpaces.length > 0) {
    log.error(
      { critical: true, regNumber, spaceIds: occupiedSpaces.map((s) => s.id) },
      "Vehicle attempting to enter is already parked in the lot",
    );
    return { allowed: false, reason: "vehicle_already_inside" };
  }

  if (ownSpaces.length > 1) {
    log.error(
      { critical: true, regNumber, spaceIds: ownSpaces.map((s) => s.id) },
      "Multiple spaces are booked for one vehicle",
    );
  }
  if (ownSpaces.length > 0) {
    return { allowed: true };
  }

  const activeSince = new Date(now.getTime() + bookingExpirationMinutes * 60_000);
  try {
    const spaceId = await claimVacantSpace(regNumber, "book", activeSince);
    return spaceId ? { allowed: true } : { allowed: false, reason: "no_available_spaces" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      log.error(
        { critical: true, regNumber },
        "Vehicle already has an open parking but no space is booked or occupied for it",
      );
    }
    throw error;
  }
}
