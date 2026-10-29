import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { env } from "../src/env";
import { createParking, createTestApp, getSpace, placeVehicle, resetDatabase, setSpace } from "./helpers";

const { app, logs, warnings, criticals } = createTestApp();
const regNumber = "XX000XX";

function postSpaceVacantAgain(body: unknown, apiKey: string | null = env.SERVICE_API_KEY) {
  return app.inject({
    method: "POST",
    url: "/api/space-vacant-again",
    headers: apiKey ? { "x-api-key": apiKey } : {},
    payload: body as object,
  });
}

async function finishParking(vehicle = regNumber) {
  await prisma.parking.updateMany({ where: { vehicleRegNumber: vehicle, status: "active" }, data: { status: "finished" } });
}

function parkingsOf(vehicle: string) {
  return prisma.parking.findMany({ where: { vehicleRegNumber: vehicle }, orderBy: { createdAt: "asc" } });
}

beforeEach(async () => {
  await resetDatabase();
  logs.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/space-vacant-again", () => {
  it("frees the occupied space of a vehicle that paid and left", async () => {
    await placeVehicle("A1", regNumber, "occupied");
    await finishParking();

    const response = await postSpaceVacantAgain({ regNumber });

    expect(response.statusCode).toBe(204);
    expect(await getSpace("A1")).toMatchObject({ status: "vacant", relatedVehicle: null });
    expect((await parkingsOf(regNumber)).map((p) => p.status)).toEqual(["finished"]);
    expect(logs).toEqual([]);
  });

  it("normalizes the registration number", async () => {
    await placeVehicle("A1", regNumber, "occupied");
    await finishParking();

    await postSpaceVacantAgain({ regNumber: " xx000xx " });

    expect(await getSpace("A1")).toMatchObject({ status: "vacant", relatedVehicle: null });
  });

  it.each([
    ["missing", {}],
    ["not a string", { regNumber: 123 }],
    ["empty", { regNumber: "  " }],
    ["too long", { regNumber: "A".repeat(16) }],
  ])("rejects a %s registration number with a critical log", async (_, body) => {
    await placeVehicle("A1", regNumber, "occupied");

    const response = await postSpaceVacantAgain(body);

    expect(response.statusCode).toBe(400);
    expect(criticals()).toHaveLength(1);
    expect(await getSpace("A1")).toMatchObject({ status: "occupied", relatedVehicle: regNumber });
  });

  it("logs a critical error when no space is related to the vehicle", async () => {
    await placeVehicle("A1", "OTHER", "occupied");

    const response = await postSpaceVacantAgain({ regNumber });

    expect(response.statusCode).toBe(204);
    expect(criticals()).toHaveLength(1);
    expect(await getSpace("A1")).toMatchObject({ status: "occupied", relatedVehicle: "OTHER" });
  });

  it("frees every space related to the vehicle with a critical log", async () => {
    await placeVehicle("A1", regNumber, "occupied");
    await finishParking();
    await setSpace("A2", "occupied", regNumber);
    await setSpace("B1", "booked", regNumber);

    const response = await postSpaceVacantAgain({ regNumber });

    expect(response.statusCode).toBe(204);
    for (const displayName of ["A1", "A2", "B1"]) {
      expect(await getSpace(displayName)).toMatchObject({ status: "vacant", relatedVehicle: null });
    }
    expect(criticals()).toHaveLength(1);
    expect(warnings()).toHaveLength(1);
  });

  it("frees a booked space and cancels its booked parking with a warning", async () => {
    await placeVehicle("A1", regNumber, "booked");

    const response = await postSpaceVacantAgain({ regNumber });

    expect(response.statusCode).toBe(204);
    expect(await getSpace("A1")).toMatchObject({ status: "vacant", relatedVehicle: null });
    expect((await parkingsOf(regNumber)).map((p) => p.status)).toEqual(["cancelled"]);
    expect(warnings()).toHaveLength(2);
    expect(criticals()).toHaveLength(0);
  });

  it("cleans up a vacant space still related to the vehicle with a warning", async () => {
    await setSpace("A1", "vacant", regNumber);

    const response = await postSpaceVacantAgain({ regNumber });

    expect(response.statusCode).toBe(204);
    expect(await getSpace("A1")).toMatchObject({ status: "vacant", relatedVehicle: null });
    expect(warnings()).toHaveLength(1);
    expect(criticals()).toHaveLength(0);
  });

  it("finishes an unpaid active parking with its total up to now and a critical log", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T10:30:00+04:00"));
    await setSpace("A1", "occupied", regNumber);
    const parking = await createParking("A1", regNumber, "active", new Date("2026-10-28T10:00:00+04:00"));

    const response = await postSpaceVacantAgain({ regNumber });

    expect(response.statusCode).toBe(204);
    expect(await getSpace("A1")).toMatchObject({ status: "vacant", relatedVehicle: null });
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parking.id } })).toMatchObject({
      status: "finished",
      total: 30 * 20,
    });
    expect(criticals()).toEqual([expect.objectContaining({ unpaidTotal: 600 })]);
  });

  it("leaves other vehicles' spaces and parkings untouched", async () => {
    await placeVehicle("A1", regNumber, "occupied");
    await finishParking();
    await placeVehicle("A2", "OTHER", "occupied");
    await placeVehicle("A3", "BOOKER", "booked");

    await postSpaceVacantAgain({ regNumber });

    expect(await getSpace("A2")).toMatchObject({ status: "occupied", relatedVehicle: "OTHER" });
    expect(await getSpace("A3")).toMatchObject({ status: "booked", relatedVehicle: "BOOKER" });
    expect((await parkingsOf("OTHER")).map((p) => p.status)).toEqual(["active"]);
    expect((await parkingsOf("BOOKER")).map((p) => p.status)).toEqual(["booked"]);
  });

  it("is safe to repeat: the second call only logs that no space is related", async () => {
    await placeVehicle("A1", regNumber, "occupied");
    await finishParking();

    await postSpaceVacantAgain({ regNumber });
    const second = await postSpaceVacantAgain({ regNumber });

    expect(second.statusCode).toBe(204);
    expect(await getSpace("A1")).toMatchObject({ status: "vacant", relatedVehicle: null });
    expect(criticals()).toHaveLength(1);
  });

  it("lets the freed space be taken and the vehicle come back", async () => {
    await placeVehicle("A1", regNumber, "booked");
    await postSpaceVacantAgain({ regNumber });

    const entrance = await app.inject({
      method: "POST",
      url: "/api/new-entrance",
      headers: { "x-api-key": env.SERVICE_API_KEY },
      payload: { regNumber },
    });

    expect(entrance.json()).toEqual({ allowed: true });
    expect(await getSpace("A1")).toMatchObject({ status: "booked", relatedVehicle: regNumber });
  });

  it.each([
    ["missing", null],
    ["wrong", "wrong-key-wrong-key"],
  ])("rejects a %s API key", async (_, apiKey) => {
    await placeVehicle("A1", regNumber, "occupied");

    const response = await postSpaceVacantAgain({ regNumber }, apiKey);

    expect(response.statusCode).toBe(401);
    expect(await getSpace("A1")).toMatchObject({ status: "occupied", relatedVehicle: regNumber });
  });
});
