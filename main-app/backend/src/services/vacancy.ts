import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db";
import { refreshParkingTotals } from "./parkings";

export async function handleCarExit(regNumber: string, log: FastifyBaseLogger, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    const spaces = await tx.space.findMany({ where: { relatedVehicle: regNumber }, orderBy: { displayName: "asc" } });
    if (spaces.length === 0) {
      log.error({ critical: true, regNumber }, "Vehicle left the lot but no space is related to it");
      return;
    }
    if (spaces.length > 1) {
      log.error(
        { critical: true, regNumber, spaces: spaces.map((s) => s.displayName) },
        "Vehicle left the lot while related to several spaces, all of them were freed",
      );
    }
    for (const space of spaces) {
      if (space.status === "booked") {
        log.warn({ regNumber, space: space.displayName }, "Vehicle left the lot while its space was booked, the space was freed");
      }
      if (space.status === "vacant") {
        log.warn({ regNumber, space: space.displayName }, "Vacant space was still related to a vehicle that left, cleaned up");
      }
    }

    const spaceIds = spaces.map((s) => s.id);
    await tx.space.updateMany({
      where: { id: { in: spaceIds }, relatedVehicle: regNumber },
      data: { status: "vacant", relatedVehicle: null },
    });

    const openParkings = await tx.parking.findMany({
      where: { spaceId: { in: spaceIds }, vehicleRegNumber: regNumber, status: { in: ["booked", "active"] } },
    });
    for (const parking of openParkings) {
      if (parking.status === "booked") {
        await tx.parking.update({ where: { id: parking.id }, data: { status: "cancelled" } });
        log.warn({ regNumber, parkingId: parking.id }, "Booked parking of a vehicle that left was cancelled");
        continue;
      }
      const { total } = await tx.parking.update({
        where: { id: parking.id },
        data: { ...refreshParkingTotals(parking, now), status: "finished" },
      });
      log.error(
        { critical: true, regNumber, parkingId: parking.id, unpaidTotal: total },
        "Vehicle left the lot without paying, its parking was finished",
      );
    }
  });
}
