import { bookingExpirationMinutes, defaultCarDisplayName, type Booking, type MyParking } from "@parking/shared";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db";
import { Prisma } from "../generated/prisma/client";
import { parkingTimesFrom } from "./parkings";

export type BookSpaceResult = { booking: Booking } | { error: "space_unavailable" | "car_not_found" | "vehicle_busy" };

class SpaceUnavailableError extends Error {}

export async function bookSpace(userId: string, spaceId: string, carId: string, now = new Date()): Promise<BookSpaceResult> {
  const car = await prisma.userVehicle.findFirst({ where: { id: carId, userId, status: "active" } });
  if (!car) {
    return { error: "car_not_found" };
  }
  const regNumber = car.vehicleRegNumber;
  const expiresAt = new Date(now.getTime() + bookingExpirationMinutes * 60_000);

  try {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.space.updateMany({
        where: { id: spaceId, status: "vacant" },
        data: { status: "booked", relatedVehicle: regNumber },
      });
      if (count === 0) {
        throw new SpaceUnavailableError();
      }
      const parking = await tx.parking.create({
        data: { status: "booked", vehicleRegNumber: regNumber, spaceId, ...parkingTimesFrom(expiresAt) },
        include: { space: true },
      });
      return {
        booking: {
          parkingId: parking.id,
          spaceId,
          spaceName: parking.space.displayName,
          regNumber,
          expiresAt: expiresAt.toISOString(),
        },
      };
    });
  } catch (error) {
    if (error instanceof SpaceUnavailableError) {
      return { error: "space_unavailable" };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "vehicle_busy" };
    }
    throw error;
  }
}

export async function listMyParkings(userId: string): Promise<MyParking[]> {
  const cars = await prisma.userVehicle.findMany({ where: { userId, status: "active" } });
  const carNames = new Map(cars.map((car) => [car.vehicleRegNumber, car.displayName ?? defaultCarDisplayName]));
  const parkings = await prisma.parking.findMany({
    where: { vehicleRegNumber: { in: [...carNames.keys()] }, status: { in: ["booked", "active"] } },
    include: { space: true },
    orderBy: { space: { displayName: "asc" } },
  });
  return parkings.map((parking) => {
    const base = {
      parkingId: parking.id,
      spaceId: parking.spaceId,
      spaceName: parking.space.displayName,
      regNumber: parking.vehicleRegNumber,
      carName: carNames.get(parking.vehicleRegNumber) ?? defaultCarDisplayName,
    };
    return parking.status === "booked"
      ? { ...base, status: "booked", expiresAt: parking.activeSince.toISOString() }
      : { ...base, status: "active", activeSince: parking.activeSince.toISOString() };
  });
}

export async function cancelBooking(
  userId: string,
  parkingId: string,
  log: FastifyBaseLogger,
): Promise<"cancelled" | "not_found" | "booking_not_active"> {
  const parking = await prisma.parking.findUnique({ where: { id: parkingId } });
  const ownCar =
    parking &&
    (await prisma.userVehicle.findFirst({
      where: { userId, vehicleRegNumber: parking.vehicleRegNumber, status: "active" },
    }));
  if (!parking || !ownCar) {
    return "not_found";
  }

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.parking.updateMany({
      where: { id: parkingId, status: "booked" },
      data: { status: "cancelled" },
    });
    if (count === 0) {
      return "booking_not_active";
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
    return "cancelled";
  });
}
