import { getRateTypeAt, type SpaceStatus } from "@parking/shared";
import { buildApp } from "../src/app";
import { prisma } from "../src/db";
import { spaceDisplayNames } from "../src/lot";

export type LogEntry = { level: number; msg: string; critical?: boolean };

export function createTestApp() {
  const logs: LogEntry[] = [];
  const app = buildApp({
    logger: {
      level: "warn",
      stream: { write: (line: string) => void logs.push(JSON.parse(line)) },
    },
  });
  return {
    app,
    logs,
    warnings: () => logs.filter((l) => l.level === 40),
    criticals: () => logs.filter((l) => l.level === 50 && l.critical),
  };
}

export async function resetDatabase() {
  await prisma.$executeRaw`TRUNCATE "Parking", "Space", "Vehicle" CASCADE`;
  await prisma.space.createMany({
    data: spaceDisplayNames.map((displayName) => ({ displayName })),
  });
}

export function getSpace(displayName: string) {
  return prisma.space.findUniqueOrThrow({ where: { displayName } });
}

export function setSpace(displayName: string, status: SpaceStatus, relatedVehicle: string | null) {
  return prisma.space.update({ where: { displayName }, data: { status, relatedVehicle } });
}

export async function createParking(
  displayName: string,
  regNumber: string,
  status: "booked" | "active",
  time = new Date(),
) {
  const space = await getSpace(displayName);
  return prisma.parking.create({
    data: {
      status,
      vehicleRegNumber: regNumber,
      spaceId: space.id,
      activeSince: time,
      currentRate: getRateTypeAt(time),
      latestRateChange: time,
      latestTotalUpdate: time,
    },
  });
}

export async function placeVehicle(displayName: string, regNumber: string, status: "booked" | "occupied") {
  await setSpace(displayName, status, regNumber);
  await createParking(displayName, regNumber, status === "occupied" ? "active" : "booked");
}

export async function fillSpaces(displayNames: string[], status: "booked" | "occupied") {
  for (const [index, displayName] of displayNames.entries()) {
    await placeVehicle(displayName, `OTHER${index}`, status);
  }
}
