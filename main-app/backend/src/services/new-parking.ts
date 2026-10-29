import { newParkingRequestSchema } from "@parking/shared";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db";
import type { Parking, Space } from "../generated/prisma/client";
import { claimVacantSpace, parkingTimesFrom } from "./parkings";

export type NewParkingResult = "activated" | "already_active" | "cancelled" | "no_space";

const maxClockSkewMs = 60_000;

export function resolveEntranceTime(rawTime: unknown, log: FastifyBaseLogger, now = new Date()) {
  const parsed = newParkingRequestSchema.shape.time.safeParse(rawTime);
  const time = parsed.success ? new Date(parsed.data) : null;
  if (!time || time.getTime() > now.getTime() + maxClockSkewMs) {
    log.warn({ rawTime }, "Entrance time is missing, malformed or in the future, using the current time");
    return now;
  }
  return time;
}

export async function handleNewParking(regNumber: string, time: Date, log: FastifyBaseLogger): Promise<NewParkingResult> {
  const openParking = await prisma.parking.findFirst({
    where: { vehicleRegNumber: regNumber, status: { in: ["booked", "active"] } },
    include: { space: true },
  });

  if (openParking?.status === "active") {
    log.warn({ regNumber, parkingId: openParking.id }, "Vehicle entered but its parking is already active");
    return "already_active";
  }
  if (openParking) {
    return activateBookedParking(openParking, regNumber, time, log);
  }
  return createParkingWithoutBooking(regNumber, time, log);
}

async function activateBookedParking(
  parking: Parking & { space: Space },
  regNumber: string,
  time: Date,
  log: FastifyBaseLogger,
): Promise<NewParkingResult> {
  const { space } = parking;
  const context = { regNumber, parkingId: parking.id, spaceId: space.id, spaceStatus: space.status, spaceVehicle: space.relatedVehicle };

  if (space.status !== "vacant" && space.relatedVehicle !== regNumber) {
    await prisma.parking.update({ where: { id: parking.id }, data: { status: "cancelled" } });
    log.error({ critical: true, ...context }, "Booked space is held by another vehicle, the booking was cancelled");
    return "cancelled";
  }
  if (space.status !== "booked") {
    log.warn(context, `Space of the booked parking was ${space.status}, occupying it anyway`);
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.parking.updateMany({
      where: { id: parking.id, status: "booked" },
      data: { status: "active", ...parkingTimesFrom(time) },
    });
    if (count === 0) {
      throw new Error(`Parking ${parking.id} stopped being booked while it was being activated`);
    }
    await tx.space.update({ where: { id: space.id }, data: { status: "occupied", relatedVehicle: regNumber } });
  });
  return "activated";
}

async function createParkingWithoutBooking(regNumber: string, time: Date, log: FastifyBaseLogger): Promise<NewParkingResult> {
  const ownSpace = await prisma.space.findFirst({
    where: { relatedVehicle: regNumber, status: { in: ["booked", "occupied"] } },
    orderBy: { displayName: "asc" },
  });

  if (ownSpace) {
    log.warn(
      { regNumber, spaceId: ownSpace.id, spaceStatus: ownSpace.status },
      "Space is held for the vehicle but it has no parking, creating one",
    );
    await prisma.$transaction([
      prisma.space.update({ where: { id: ownSpace.id }, data: { status: "occupied" } }),
      prisma.parking.create({
        data: { status: "active", vehicleRegNumber: regNumber, spaceId: ownSpace.id, ...parkingTimesFrom(time) },
      }),
    ]);
    return "activated";
  }

  const spaceId = await claimVacantSpace(regNumber, "occupy", time);
  if (!spaceId) {
    log.error({ critical: true, regNumber }, "Vehicle entered the lot but there is no space for it");
    return "no_space";
  }
  log.warn({ regNumber, spaceId }, "Vehicle entered without a booking, a vacant space was assigned to it");
  return "activated";
}
