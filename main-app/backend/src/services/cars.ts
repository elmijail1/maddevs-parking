import {
  decodeCursor,
  defaultCarDisplayName,
  encodeCursor,
  listPageSize,
  maxCarsPerUser,
  type AddCarRequest,
  type Car,
  type CarsResponse,
} from "@parking/shared";
import { prisma } from "../db";
import { Prisma, type UserVehicle } from "../generated/prisma/client";

export type AddCarResult = { car: Car } | { error: "vehicle_mismatch" | "already_added" | "car_limit_reached" };

export function toCar(link: UserVehicle): Car {
  return {
    id: link.id,
    regNumber: link.vehicleRegNumber,
    displayName: link.displayName ?? defaultCarDisplayName,
    addedAt: link.latestStatusChange.toISOString(),
  };
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

async function findOrCreateVehicle({ regNumber, vin, certificateNumber }: AddCarRequest) {
  const existing = await prisma.vehicle.findUnique({ where: { regNumber } });
  if (existing) {
    return existing;
  }
  try {
    return await prisma.vehicle.create({ data: { regNumber, vin, registrationCertificateNumber: certificateNumber } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return prisma.vehicle.findUniqueOrThrow({ where: { regNumber } });
    }
    throw error;
  }
}

export async function listCars(userId: string, cursor?: string): Promise<CarsResponse> {
  const after = cursor && decodeCursor(cursor);
  const found = await prisma.userVehicle.findMany({
    where: {
      userId,
      status: "active",
      ...(after && {
        OR: [
          { latestStatusChange: { lt: after.date } },
          { latestStatusChange: after.date, id: { lt: after.id } },
        ],
      }),
    },
    orderBy: [{ latestStatusChange: "desc" }, { id: "desc" }],
    take: listPageSize + 1,
  });
  const links = found.slice(0, listPageSize);
  const last = links.at(-1);
  return {
    cars: links.map(toCar),
    nextCursor: found.length > listPageSize && last ? encodeCursor(last.latestStatusChange, last.id) : null,
  };
}

class CarLimitReachedError extends Error {}

const activeCarCount = (client: Prisma.TransactionClient, userId: string) =>
  client.userVehicle.count({ where: { userId, status: "active" } });

export async function addCar(userId: string, request: AddCarRequest, now = new Date()): Promise<AddCarResult> {
  if ((await activeCarCount(prisma, userId)) >= maxCarsPerUser) {
    return { error: "car_limit_reached" };
  }
  const vehicle = await findOrCreateVehicle(request);
  if (vehicle.vin !== request.vin || vehicle.registrationCertificateNumber !== request.certificateNumber) {
    return { error: "vehicle_mismatch" };
  }

  const displayName = request.displayName ?? defaultCarDisplayName;
  const key = { userId_vehicleRegNumber: { userId, vehicleRegNumber: vehicle.regNumber } };

  try {
    const link = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const existingLink = await tx.userVehicle.findUnique({ where: key });
      if (existingLink?.status === "active") {
        return null;
      }
      if ((await activeCarCount(tx, userId)) >= maxCarsPerUser) {
        throw new CarLimitReachedError();
      }
      return existingLink
        ? tx.userVehicle.update({
            where: { id: existingLink.id },
            data: { status: "active", displayName, latestStatusChange: now },
          })
        : tx.userVehicle.create({
            data: { userId, vehicleRegNumber: vehicle.regNumber, displayName, latestStatusChange: now },
          });
    });
    return link ? { car: toCar(link) } : { error: "already_added" };
  } catch (error) {
    if (error instanceof CarLimitReachedError) {
      return { error: "car_limit_reached" };
    }
    if (isUniqueViolation(error)) {
      return { error: "already_added" };
    }
    throw error;
  }
}

export async function renameCar(userId: string, id: string, displayName: string) {
  const { count } = await prisma.userVehicle.updateMany({
    where: { id, userId, status: "active" },
    data: { displayName },
  });
  return count > 0 ? toCar(await prisma.userVehicle.findUniqueOrThrow({ where: { id } })) : null;
}

export async function removeCar(userId: string, id: string, now = new Date()) {
  const { count } = await prisma.userVehicle.updateMany({
    where: { id, userId, status: "active" },
    data: { status: "inactive", displayName: null, latestStatusChange: now },
  });
  return count > 0;
}
