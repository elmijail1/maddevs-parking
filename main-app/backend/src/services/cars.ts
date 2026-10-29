import { defaultCarDisplayName, type AddCarRequest, type Car } from "@parking/shared";
import { prisma } from "../db";
import { Prisma, type UserVehicle } from "../generated/prisma/client";

export type AddCarResult = { car: Car } | { error: "vehicle_mismatch" | "already_added" };

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

export async function listCars(userId: string) {
  const links = await prisma.userVehicle.findMany({
    where: { userId, status: "active" },
    orderBy: [{ latestStatusChange: "desc" }, { createdAt: "desc" }],
  });
  return links.map(toCar);
}

export async function addCar(userId: string, request: AddCarRequest, now = new Date()): Promise<AddCarResult> {
  const vehicle = await findOrCreateVehicle(request);
  if (vehicle.vin !== request.vin || vehicle.registrationCertificateNumber !== request.certificateNumber) {
    return { error: "vehicle_mismatch" };
  }

  const displayName = request.displayName ?? defaultCarDisplayName;
  const key = { userId_vehicleRegNumber: { userId, vehicleRegNumber: vehicle.regNumber } };
  const existingLink = await prisma.userVehicle.findUnique({ where: key });
  if (existingLink?.status === "active") {
    return { error: "already_added" };
  }

  try {
    const link = existingLink
      ? await prisma.userVehicle.update({
          where: { id: existingLink.id, status: "inactive" },
          data: { status: "active", displayName, latestStatusChange: now },
        })
      : await prisma.userVehicle.create({
          data: { userId, vehicleRegNumber: vehicle.regNumber, displayName, latestStatusChange: now },
        });
    return { car: toCar(link) };
  } catch (error) {
    if (isUniqueViolation(error) || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")) {
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
