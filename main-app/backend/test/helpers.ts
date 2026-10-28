import { prisma } from "../src/db";
import { spaceDisplayNames } from "../src/lot";

export async function resetDatabase() {
  await prisma.$executeRaw`TRUNCATE "Parking", "Space", "Vehicle" CASCADE`;
  await prisma.space.createMany({
    data: spaceDisplayNames.map((displayName) => ({ displayName })),
  });
}

export async function placeVehicle(displayName: string, regNumber: string, status: "booked" | "occupied") {
  const now = new Date();
  const space = await prisma.space.update({
    where: { displayName },
    data: { status, relatedVehicle: regNumber },
  });
  await prisma.parking.create({
    data: {
      status: status === "occupied" ? "active" : "booked",
      vehicleRegNumber: regNumber,
      spaceId: space.id,
      activeSince: now,
      currentRate: "day",
      latestRateChange: now,
      latestTotalUpdate: now,
    },
  });
}

export async function fillSpaces(displayNames: string[], status: "booked" | "occupied") {
  for (const [index, displayName] of displayNames.entries()) {
    await placeVehicle(displayName, `OTHER${index}`, status);
  }
}
