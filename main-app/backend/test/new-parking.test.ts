import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { env } from "../src/env";
import { spaceDisplayNames } from "../src/lot";
import {
  createParking,
  createTestApp,
  fillSpaces,
  getSpace,
  placeVehicle,
  resetDatabase,
  setSpace,
} from "./helpers";

const { app, logs, warnings, criticals } = createTestApp();
const regNumber = "XX000XX";
const dayTime = new Date("2026-10-28T06:01:00Z");
const nightTime = new Date("2026-10-28T17:30:00Z");

function postNewParking(body: unknown, apiKey: string | null = env.SERVICE_API_KEY) {
  return app.inject({
    method: "POST",
    url: "/api/new-parking",
    headers: apiKey ? { "x-api-key": apiKey } : {},
    payload: body as object,
  });
}

function getParkings(vehicle = regNumber) {
  return prisma.parking.findMany({ where: { vehicleRegNumber: vehicle }, orderBy: { createdAt: "asc" } });
}

const activatedAt = (time: Date) => ({
  status: "active",
  activeSince: time,
  latestRateChange: time,
  latestTotalUpdate: time,
  total: 0,
});

beforeEach(async () => {
  await resetDatabase();
  logs.length = 0;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/new-parking", () => {
  it("activates the booked parking and occupies its booked space", async () => {
    await placeVehicle("A1", regNumber, "booked");

    const response = await postNewParking({ regNumber, time: dayTime.toISOString() });

    expect(response.statusCode).toBe(204);
    const parkings = await getParkings();
    expect(parkings).toHaveLength(1);
    expect(parkings[0]).toMatchObject({ ...activatedAt(dayTime), currentRate: "day" });
    expect(await getSpace("A1")).toMatchObject({ status: "occupied", relatedVehicle: regNumber });
    expect(warnings()).toHaveLength(0);
    expect(criticals()).toHaveLength(0);
  });

  it("sets the night rate for a night entrance", async () => {
    await placeVehicle("A1", regNumber, "booked");

    await postNewParking({ regNumber, time: nightTime.toISOString() });

    const [parking] = await getParkings();
    expect(parking).toMatchObject({ ...activatedAt(nightTime), currentRate: "night" });
  });

  it("activates the parking and occupies its space when the space is vacant", async () => {
    await createParking("A1", regNumber, "booked");

    const response = await postNewParking({ regNumber, time: dayTime.toISOString() });

    expect(response.statusCode).toBe(204);
    const [parking] = await getParkings();
    expect(parking).toMatchObject(activatedAt(dayTime));
    expect(await getSpace("A1")).toMatchObject({ status: "occupied", relatedVehicle: regNumber });
    expect(warnings()).toHaveLength(1);
    expect(criticals()).toHaveLength(0);
  });

  it("activates the parking when its space is already occupied by the same car", async () => {
    await setSpace("A1", "occupied", regNumber);
    await createParking("A1", regNumber, "booked");

    const response = await postNewParking({ regNumber, time: dayTime.toISOString() });

    expect(response.statusCode).toBe(204);
    const [parking] = await getParkings();
    expect(parking).toMatchObject(activatedAt(dayTime));
    expect(await getSpace("A1")).toMatchObject({ status: "occupied", relatedVehicle: regNumber });
    expect(warnings()).toHaveLength(1);
    expect(criticals()).toHaveLength(0);
  });

  it("cancels the parking when its space is occupied by another car", async () => {
    await setSpace("A1", "occupied", "OTHER");
    await createParking("A1", regNumber, "booked");

    const response = await postNewParking({ regNumber, time: dayTime.toISOString() });

    expect(response.statusCode).toBe(204);
    const [parking] = await getParkings();
    expect(parking?.status).toBe("cancelled");
    expect(await getSpace("A1")).toMatchObject({ status: "occupied", relatedVehicle: "OTHER" });
    expect(criticals()).toHaveLength(1);
  });

  it("creates an active parking when the space is booked for the car but the parking is missing", async () => {
    await setSpace("A1", "booked", regNumber);

    const response = await postNewParking({ regNumber, time: dayTime.toISOString() });

    expect(response.statusCode).toBe(204);
    const parkings = await getParkings();
    expect(parkings).toHaveLength(1);
    const space = await getSpace("A1");
    expect(parkings[0]).toMatchObject({ ...activatedAt(dayTime), spaceId: space.id });
    expect(space).toMatchObject({ status: "occupied", relatedVehicle: regNumber });
    expect(warnings()).toHaveLength(1);
    expect(criticals()).toHaveLength(0);
  });

  it.each([{}, { time: "yesterday" }, { time: 12345 }, { time: "2099-01-01T00:00:00Z" }])(
    "uses the current time when the time is missing, malformed or in the future: %j",
    async (timeField) => {
      await placeVehicle("A1", regNumber, "booked");
      const before = Date.now();

      const response = await postNewParking({ regNumber, ...timeField });

      expect(response.statusCode).toBe(204);
      const [parking] = await getParkings();
      expect(parking?.status).toBe("active");
      expect(parking!.activeSince.getTime()).toBeGreaterThanOrEqual(before);
      expect(parking!.activeSince.getTime()).toBeLessThanOrEqual(Date.now());
      expect(await getSpace("A1")).toMatchObject({ status: "occupied", relatedVehicle: regNumber });
      expect(warnings()).toHaveLength(1);
    },
  );

  it.each([{}, { regNumber: "" }, { regNumber: "A".repeat(16) }, { regNumber: 123 }])(
    "rejects an invalid registration number with a critical log: %j",
    async (regNumberField) => {
      await placeVehicle("A1", regNumber, "booked");

      const response = await postNewParking({ ...regNumberField, time: dayTime.toISOString() });

      expect(response.statusCode).toBe(400);
      const [parking] = await getParkings();
      expect(parking?.status).toBe("booked");
      expect(await getSpace("A1")).toMatchObject({ status: "booked", relatedVehicle: regNumber });
      expect(criticals()).toHaveLength(1);
    },
  );

  it("occupies a vacant space when the car entered without any booking", async () => {
    await fillSpaces(["A1", "A2"], "occupied");

    const response = await postNewParking({ regNumber, time: dayTime.toISOString() });

    expect(response.statusCode).toBe(204);
    const parkings = await getParkings();
    expect(parkings).toHaveLength(1);
    const space = await getSpace("A3");
    expect(parkings[0]).toMatchObject({ ...activatedAt(dayTime), spaceId: space.id });
    expect(space).toMatchObject({ status: "occupied", relatedVehicle: regNumber });
    expect(warnings()).toHaveLength(1);
  });

  it("responds 409 with a critical log when the car entered without a booking into a full lot", async () => {
    await fillSpaces(spaceDisplayNames, "occupied");

    const response = await postNewParking({ regNumber, time: dayTime.toISOString() });

    expect(response.statusCode).toBe(409);
    expect(await getParkings()).toHaveLength(0);
    expect(criticals()).toHaveLength(1);
  });

  it("changes nothing when the car's parking is already active", async () => {
    await placeVehicle("A1", regNumber, "occupied");
    const parkingsBefore = await getParkings();

    const response = await postNewParking({ regNumber, time: dayTime.toISOString() });

    expect(response.statusCode).toBe(204);
    expect(await getParkings()).toEqual(parkingsBefore);
    expect(warnings()).toHaveLength(1);
  });

  it("rejects a request without a valid API key", async () => {
    await placeVehicle("A1", regNumber, "booked");

    const response = await postNewParking({ regNumber, time: dayTime.toISOString() }, "wrong-key");

    expect(response.statusCode).toBe(401);
    const [parking] = await getParkings();
    expect(parking?.status).toBe("booked");
  });
});

describe("open parking constraints", () => {
  it("prevents several open parkings for one car", async () => {
    await createParking("A1", regNumber, "booked");

    await expect(createParking("A2", regNumber, "booked")).rejects.toThrow();
    await expect(createParking("A2", regNumber, "active")).rejects.toThrow();
  });

  it("prevents several open parkings for one space", async () => {
    await createParking("A1", "CAR1", "booked");

    await expect(createParking("A1", "CAR2", "active")).rejects.toThrow();
  });

  it("allows new parkings next to finished and cancelled ones", async () => {
    const first = await createParking("A1", regNumber, "active");
    await prisma.parking.update({ where: { id: first.id }, data: { status: "finished" } });
    const second = await createParking("A1", regNumber, "booked");
    await prisma.parking.update({ where: { id: second.id }, data: { status: "cancelled" } });

    await expect(createParking("A1", regNumber, "booked")).resolves.toBeDefined();
  });
});
