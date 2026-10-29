import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { createParking, createTestApp, getSpace, placeVehicle, resetDatabase, setSpace, signUp } from "./helpers";

const { app } = createTestApp();
const regNumber = "AA111AA";
let cookie: string;

function inject(method: "GET" | "POST" | "DELETE", url: string, payload?: unknown, as = cookie) {
  return app.inject({ method, url, headers: as ? { cookie: as } : {}, ...(payload ? { payload: payload as object } : {}) });
}

async function addCar(car = regNumber, as = cookie, displayName?: string) {
  const response = await inject(
    "POST",
    "/api/cars",
    { regNumber: car, vin: `VIN${car}`, certificateNumber: `C${car}`, ...(displayName ? { displayName } : {}) },
    as,
  );
  return response.json().car as { id: string };
}

const book = async (spaceName: string, carId: string, as = cookie) =>
  inject("POST", "/api/bookings", { spaceId: (await getSpace(spaceName)).id, carId }, as);
const myParkings = async (as = cookie) => (await inject("GET", "/api/my-parkings", undefined, as)).json().parkings;

beforeEach(async () => {
  await resetDatabase();
  cookie = await signUp(app);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/bookings", () => {
  it("books the space for the car and creates a booked parking that expires in 15 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T07:50:00+04:00"));
    const car = await addCar();
    const space = await getSpace("A2");

    const response = await book("A2", car.id);

    expect(response.statusCode).toBe(201);
    const parking = await prisma.parking.findFirstOrThrow();
    expect(response.json()).toEqual({
      booking: {
        parkingId: parking.id,
        spaceId: space.id,
        spaceName: "A2",
        regNumber,
        expiresAt: "2026-10-29T04:05:00.000Z",
      },
    });
    expect(await getSpace("A2")).toMatchObject({ status: "booked", relatedVehicle: regNumber });
    expect(parking).toMatchObject({
      status: "booked",
      vehicleRegNumber: regNumber,
      spaceId: space.id,
      activeSince: new Date("2026-10-29T08:05:00+04:00"),
      currentRate: "day",
      latestRateChange: new Date("2026-10-29T08:05:00+04:00"),
      latestTotalUpdate: new Date("2026-10-29T08:05:00+04:00"),
      total: 0,
    });
  });

  it.each(["booked", "occupied"] as const)("refuses a space that is already %s", async (status) => {
    const car = await addCar();
    await placeVehicle("A1", "OTHER1", status);

    const response = await book("A1", car.id);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "space_unavailable" });
    expect(await getSpace("A1")).toMatchObject({ status, relatedVehicle: "OTHER1" });
    expect(await prisma.parking.count({ where: { vehicleRegNumber: regNumber } })).toBe(0);
  });

  it("lets only one of two users book the same space at once", async () => {
    const mine = await addCar();
    const otherCookie = await signUp(app, "other@example.com");
    const theirs = await addCar("BB222BB", otherCookie);

    const responses = await Promise.all([book("A1", mine.id), book("A1", theirs.id, otherCookie)]);

    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await prisma.parking.count()).toBe(1);
  });

  it.each(["booked", "occupied"] as const)("refuses a car that already has a %s space and changes nothing", async (status) => {
    const car = await addCar();
    await placeVehicle("B1", regNumber, status);

    const response = await book("A1", car.id);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "vehicle_busy" });
    expect(await getSpace("A1")).toMatchObject({ status: "vacant", relatedVehicle: null });
    expect(await prisma.parking.count()).toBe(1);
  });

  it("refuses a car that isn't on the user's list", async () => {
    const theirs = await addCar("BB222BB", await signUp(app, "other@example.com"));
    const removed = await addCar();
    await inject("DELETE", `/api/cars/${removed.id}`);

    for (const carId of [theirs.id, removed.id, crypto.randomUUID()]) {
      const response = await book("A1", carId);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "car_not_found" });
    }
    expect(await getSpace("A1")).toMatchObject({ status: "vacant" });
  });

  it("lets two users who share a car book with it", async () => {
    const otherCookie = await signUp(app, "other@example.com");
    await addCar(regNumber, otherCookie);
    const mine = await addCar();

    expect((await book("A1", mine.id)).statusCode).toBe(201);
    expect(await myParkings(otherCookie)).toEqual([expect.objectContaining({ spaceName: "A1", regNumber })]);
  });

  it.each([
    ["no body", undefined],
    ["a missing car", { spaceId: crypto.randomUUID() }],
    ["a malformed space id", { spaceId: "A1", carId: crypto.randomUUID() }],
  ])("rejects %s", async (_, body) => {
    expect((await inject("POST", "/api/bookings", body)).statusCode).toBe(400);
  });

  it("requires a logged-in user", async () => {
    const car = await addCar();

    expect((await book("A1", car.id, "")).statusCode).toBe(401);
    expect(await prisma.parking.count()).toBe(0);
  });
});

describe("GET /api/my-parkings", () => {
  it("lists the booked and active parkings of the user's active cars", async () => {
    await addCar("AA111AA", cookie, "My Jeep");
    await addCar("BB222BB");
    const removed = await addCar("CC333CC");
    await inject("DELETE", `/api/cars/${removed.id}`);
    await setSpace("A1", "booked", "AA111AA");
    const booked = await createParking("A1", "AA111AA", "booked", new Date("2026-10-29T10:15:00Z"));
    await setSpace("B2", "occupied", "BB222BB");
    const active = await createParking("B2", "BB222BB", "active", new Date("2026-10-29T09:00:00Z"));
    await placeVehicle("A3", "CC333CC", "occupied");
    await placeVehicle("B1", "STRANGER1", "occupied");

    expect(await myParkings()).toEqual([
      {
        parkingId: booked.id,
        spaceId: booked.spaceId,
        spaceName: "A1",
        regNumber: "AA111AA",
        carName: "My Jeep",
        status: "booked",
        expiresAt: "2026-10-29T10:15:00.000Z",
      },
      {
        parkingId: active.id,
        spaceId: active.spaceId,
        spaceName: "B2",
        regNumber: "BB222BB",
        carName: "New car",
        status: "active",
        activeSince: "2026-10-29T09:00:00.000Z",
      },
    ]);
  });

  it("leaves out finished and cancelled parkings", async () => {
    await addCar();
    await placeVehicle("A1", regNumber, "occupied");
    await prisma.parking.updateMany({ data: { status: "finished" } });
    await createParking("A2", regNumber, "booked");
    await prisma.parking.updateMany({ where: { status: "booked" }, data: { status: "cancelled" } });

    expect(await myParkings()).toEqual([]);
  });

  it("is empty for a user without cars and requires a login", async () => {
    await placeVehicle("A1", regNumber, "occupied");

    expect(await myParkings()).toEqual([]);
    expect((await inject("GET", "/api/my-parkings", undefined, "")).statusCode).toBe(401);
  });
});
