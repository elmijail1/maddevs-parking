import {
  getRatePerMinuteCents,
  getRateTypeAt,
  nextRateBoundaryAfter,
  type ParkingTotals,
} from "@parking/shared";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db";
import { refreshActiveParking } from "./parkings";
import { scheduleJob } from "./scheduler";

const hourMs = 60 * 60_000;
const hourlyRefreshKey = "hourly-totals-refresh";

export async function refreshOwnParking(
  userId: string,
  parkingId: string,
  now = new Date(),
): Promise<ParkingTotals | "not_found" | "parking_not_active"> {
  const parking = await prisma.parking.findUnique({ where: { id: parkingId } });
  const ownCar =
    parking &&
    (await prisma.userVehicle.findFirst({
      where: { userId, vehicleRegNumber: parking.vehicleRegNumber, status: "active" },
    }));
  if (!parking || !ownCar) {
    return "not_found";
  }
  const refreshed = await refreshActiveParking(parkingId, now);
  if (!refreshed) {
    return "parking_not_active";
  }
  const nextRateFrom = nextRateBoundaryAfter(now);
  return {
    parkingId,
    activeSince: refreshed.activeSince.toISOString(),
    chargedMinutes: Math.round((refreshed.latestTotalUpdate.getTime() - refreshed.activeSince.getTime()) / 60_000),
    total: refreshed.total,
    currentRate: refreshed.currentRate,
    ratePerHourCents: getRatePerMinuteCents(refreshed.currentRate) * 60,
    nextRate: getRateTypeAt(nextRateFrom),
    nextRateFrom: nextRateFrom.toISOString(),
  };
}

export async function refreshAllActiveParkings(log: FastifyBaseLogger, now = new Date()) {
  const parkings = await prisma.parking.findMany({ where: { status: "active" }, select: { id: true } });
  for (const { id } of parkings) {
    try {
      await refreshActiveParking(id, now);
    } catch (error) {
      log.error({ err: error, parkingId: id }, "Hourly refresh of a parking's totals failed");
    }
  }
  log.info({ parkings: parkings.length }, "Hourly refresh of the active parkings' totals done");
}

export function nextFullHour(now: Date) {
  return new Date(Math.floor(now.getTime() / hourMs) * hourMs + hourMs);
}

export function scheduleHourlyTotalsRefresh(log: FastifyBaseLogger, now = new Date()) {
  scheduleJob(
    hourlyRefreshKey,
    nextFullHour(now),
    async () => {
      try {
        await refreshAllActiveParkings(log);
      } finally {
        scheduleHourlyTotalsRefresh(log);
      }
    },
    log,
  );
}
