import { bookingExpirationMinutes, getRateTypeAt } from "@parking/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/db";
import { env } from "../src/env";
import { spaceDisplayNames } from "../src/lot";
import { fillSpaces, placeVehicle, resetDatabase } from "./helpers";

const app = buildApp({ logger: false });
const regNumber = "XX000XX";

function postNewEntrance(body: unknown, apiKey: string | null = env.SERVICE_API_KEY) {
  return app.inject({
    method: "POST",
    url: "/api/new-entrance",
    headers: apiKey ? { "x-api-key": apiKey } : {},
    payload: body as object,
  });
}

function getVehicleState(vehicle = regNumber) {
  return Promise.all([
    prisma.space.findMany({ where: { relatedVehicle: vehicle } }),
    prisma.parking.findMany({ where: { vehicleRegNumber: vehicle } }),
  ]);
}

beforeEach(resetDatabase);

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/new-entrance", () => {
  it("books a vacant space when all spaces are vacant", async () => {
    const before = Date.now();

    const response = await postNewEntrance({ regNumber });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ allowed: true });
    const [spaces, parkings] = await getVehicleState();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]).toMatchObject({ displayName: "A1", status: "booked" });
    expect(parkings).toHaveLength(1);
    const parking = parkings[0]!;
    expect(parking).toMatchObject({ status: "booked", spaceId: spaces[0]!.id, total: 0 });
    expect(parking.activeSince.getTime()).toBeGreaterThanOrEqual(before + bookingExpirationMinutes * 60_000);
    expect(parking.currentRate).toBe(getRateTypeAt(parking.activeSince));
    expect(parking.latestRateChange).toEqual(parking.activeSince);
    expect(parking.latestTotalUpdate).toEqual(parking.activeSince);
  });

  it("denies entrance when all spaces are occupied", async () => {
    await fillSpaces(spaceDisplayNames, "occupied");

    const response = await postNewEntrance({ regNumber });

    expect(response.json()).toEqual({ allowed: false, reason: "no_available_spaces" });
    const [spaces, parkings] = await getVehicleState();
    expect(spaces).toHaveLength(0);
    expect(parkings).toHaveLength(0);
  });

  it("denies entrance when all spaces are booked for other cars", async () => {
    await fillSpaces(spaceDisplayNames, "booked");

    const response = await postNewEntrance({ regNumber });

    expect(response.json()).toEqual({ allowed: false, reason: "no_available_spaces" });
    const [spaces, parkings] = await getVehicleState();
    expect(spaces).toHaveLength(0);
    expect(parkings).toHaveLength(0);
  });

  it("books the only vacant space when 5 spaces are occupied", async () => {
    await fillSpaces(["A1", "A2", "A3", "B1", "B2"], "occupied");

    const response = await postNewEntrance({ regNumber });

    expect(response.json()).toEqual({ allowed: true });
    const [spaces, parkings] = await getVehicleState();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]).toMatchObject({ displayName: "B3", status: "booked" });
    expect(parkings).toHaveLength(1);
    expect(parkings[0]).toMatchObject({ status: "booked", spaceId: spaces[0]!.id });
  });

  it("lets in a car with a booking when the other 5 spaces are occupied", async () => {
    await fillSpaces(["A1", "A2", "A3", "B1", "B2"], "occupied");
    await placeVehicle("B3", regNumber, "booked");
    const [spacesBefore, parkingsBefore] = await getVehicleState();

    const response = await postNewEntrance({ regNumber });

    expect(response.json()).toEqual({ allowed: true });
    const [spaces, parkings] = await getVehicleState();
    expect(spaces).toEqual(spacesBefore);
    expect(parkings).toEqual(parkingsBefore);
  });

  it("denies entrance to a car that is already parked in the lot", async () => {
    await placeVehicle("A1", regNumber, "occupied");

    const response = await postNewEntrance({ regNumber });

    expect(response.json()).toEqual({ allowed: false, reason: "vehicle_already_inside" });
    const [spaces, parkings] = await getVehicleState();
    expect(spaces).toHaveLength(1);
    expect(parkings).toHaveLength(1);
  });

  it("never books one space for two cars arriving at the same time", async () => {
    await fillSpaces(["A1", "A2", "A3", "B1", "B2"], "occupied");

    const responses = await Promise.all([
      postNewEntrance({ regNumber: "CAR1" }),
      postNewEntrance({ regNumber: "CAR2" }),
    ]);

    const results = responses.map((r) => r.json());
    expect(results).toContainEqual({ allowed: true });
    expect(results).toContainEqual({ allowed: false, reason: "no_available_spaces" });
    const openParkings = await prisma.parking.findMany({
      where: { vehicleRegNumber: { in: ["CAR1", "CAR2"] } },
    });
    expect(openParkings).toHaveLength(1);
  });

  it("books each vacant space once when more cars than spaces arrive at the same time", async () => {
    const cars = Array.from({ length: 10 }, (_, i) => `CAR${i}`);

    const responses = await Promise.all(cars.map((car) => postNewEntrance({ regNumber: car })));

    const allowed = responses.filter((r) => r.json().allowed);
    expect(allowed).toHaveLength(spaceDisplayNames.length);
    const bookedSpaces = await prisma.space.findMany({ where: { status: "booked" } });
    expect(new Set(bookedSpaces.map((s) => s.relatedVehicle)).size).toBe(spaceDisplayNames.length);
    expect(await prisma.parking.count()).toBe(spaceDisplayNames.length);
  });

  it("normalizes the registration number", async () => {
    const response = await postNewEntrance({ regNumber: "  xx000xx " });

    expect(response.json()).toEqual({ allowed: true });
    const [spaces] = await getVehicleState("XX000XX");
    expect(spaces).toHaveLength(1);
  });

  it.each([{}, { regNumber: "" }, { regNumber: "A".repeat(16) }, { regNumber: 123 }])(
    "rejects an invalid request body: %j",
    async (body) => {
      const response = await postNewEntrance(body);

      expect(response.statusCode).toBe(400);
      expect(await prisma.parking.count()).toBe(0);
    },
  );

  it.each([null, "wrong-key"])("rejects a request with API key %s", async (apiKey) => {
    const response = await postNewEntrance({ regNumber }, apiKey);

    expect(response.statusCode).toBe(401);
    expect(await prisma.parking.count()).toBe(0);
  });
});
