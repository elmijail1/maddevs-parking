import { getRatePerMinuteCents } from "@parking/shared";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { refreshActiveParking } from "../src/services/parkings";
import { nextFullHour, scheduleHourlyTotalsRefresh } from "../src/services/parking-totals";
import { cancelAllJobs, jobTime, runJobsDueBy } from "../src/services/scheduler";
import { createParking, createTestApp, resetDatabase, setSpace, signUp } from "./helpers";

const day = getRatePerMinuteCents("day");
const night = getRatePerMinuteCents("night");
const { app } = createTestApp();
const regNumber = "AA111AA";
const local = (time: string) => new Date(`2026-10-30T${time}+04:00`);
let cookie: string;

function inject(method: "GET" | "POST" | "DELETE", url: string, payload?: unknown, as = cookie) {
  return app.inject({ method, url, headers: as ? { cookie: as } : {}, ...(payload ? { payload: payload as object } : {}) });
}

async function addCar(as = cookie, car = regNumber) {
  return (await inject("POST", "/api/cars", { regNumber: car, vin: "VIN12345", certificateNumber: "CERT1" }, as)).json()
    .car as { id: string };
}

async function parkSince(time: Date, car = regNumber, space = "A1") {
  await setSpace(space, "occupied", car);
  return createParking(space, car, "active", time);
}

const refresh = (parkingId: string, as = cookie) => inject("POST", `/api/parkings/${parkingId}/refresh`, undefined, as);
const at = (time: Date) => vi.setSystemTime(time);

beforeEach(async () => {
  cancelAllJobs();
  await resetDatabase();
  vi.useFakeTimers({ toFake: ["Date"] });
  at(local("09:00:00"));
  cookie = await signUp(app);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/parkings/:parkingId/refresh", () => {
  it("recalculates and saves the total, and returns the parking's figures", async () => {
    await addCar();
    const parking = await parkSince(local("18:49:00"));
    at(local("20:00:40"));

    const response = await refresh(parking.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      parking: {
        parkingId: parking.id,
        activeSince: local("18:49:00").toISOString(),
        chargedMinutes: 71,
        total: 71 * day,
        currentRate: "night",
        ratePerHourCents: night * 60,
        nextRate: "day",
        nextRateFrom: new Date("2026-10-31T08:00:00+04:00").toISOString(),
      },
    });
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parking.id } })).toMatchObject({
      total: 71 * day,
      latestTotalUpdate: local("20:00:00"),
      currentRate: "night",
      latestRateChange: local("20:00:00"),
    });
  });

  it("gives the same total no matter how often it's opened", async () => {
    await addCar();
    const parking = await parkSince(local("10:00:00"));

    for (const time of ["10:10:30", "10:45:10", "11:20:59"]) {
      at(local(time));
      await refresh(parking.id);
    }

    expect((await prisma.parking.findUniqueOrThrow({ where: { id: parking.id } })).total).toBe(80 * day);
  });

  it("works for every user who has the car on their list", async () => {
    await addCar();
    const sharerCookie = await signUp(app, "sharer@example.com");
    await addCar(sharerCookie);
    const parking = await parkSince(local("10:00:00"));
    at(local("10:30:00"));

    expect((await refresh(parking.id, sharerCookie)).json().parking.total).toBe(30 * day);
  });

  it("can't be used for a car that isn't on the user's list", async () => {
    const parking = await parkSince(local("10:00:00"));
    at(local("10:30:00"));

    for (const parkingId of [parking.id, crypto.randomUUID()]) {
      expect((await refresh(parkingId)).statusCode).toBe(404);
    }
    expect((await prisma.parking.findUniqueOrThrow({ where: { id: parking.id } })).total).toBe(0);
  });

  it("answers 409 and changes nothing once the parking isn't active", async () => {
    await addCar();
    const parking = await parkSince(local("10:00:00"));
    await prisma.parking.update({ where: { id: parking.id }, data: { status: "finished", total: 500 } });
    at(local("12:00:00"));

    const response = await refresh(parking.id);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "parking_not_active" });
    expect((await prisma.parking.findUniqueOrThrow({ where: { id: parking.id } })).total).toBe(500);
  });

  it("rejects a malformed id and requires a login", async () => {
    expect((await refresh("not-a-uuid")).statusCode).toBe(400);
    expect((await refresh(crypto.randomUUID(), "")).statusCode).toBe(401);
  });
});

describe("refreshActiveParking", () => {
  it("keeps the total right when many refreshes run at once", async () => {
    const parking = await parkSince(local("10:00:00"));
    at(local("11:00:00"));

    await Promise.all(Array.from({ length: 8 }, () => refreshActiveParking(parking.id, new Date())));

    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parking.id } })).toMatchObject({
      total: 60 * day,
      latestTotalUpdate: local("11:00:00"),
    });
  });

  it("never moves the total back to an earlier time", async () => {
    const parking = await parkSince(local("10:00:00"));
    await refreshActiveParking(parking.id, local("11:00:00"));

    await refreshActiveParking(parking.id, local("10:30:00"));

    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parking.id } })).toMatchObject({
      total: 60 * day,
      latestTotalUpdate: local("11:00:00"),
    });
  });
});

describe("hourly refresh", () => {
  it("is scheduled for the next full hour", () => {
    expect(nextFullHour(local("09:00:00"))).toEqual(local("10:00:00"));
    expect(nextFullHour(local("09:59:59"))).toEqual(local("10:00:00"));
    scheduleHourlyTotalsRefresh(app.log, local("09:20:00"));

    expect(jobTime("hourly-totals-refresh")).toEqual(local("10:00:00"));
  });

  it("updates every active parking's total and rate, leaves the rest alone, and schedules the next run", async () => {
    const active = await parkSince(local("19:30:00"));
    const other = await parkSince(local("18:00:00"), "BB222BB", "A2");
    await setSpace("B1", "booked", "CC333CC");
    const booked = await createParking("B1", "CC333CC", "booked", local("20:10:00"));
    at(local("19:45:00"));
    scheduleHourlyTotalsRefresh(app.log);

    at(local("20:00:00"));
    await runJobsDueBy(local("20:00:00"), app.log);

    expect(await prisma.parking.findUniqueOrThrow({ where: { id: active.id } })).toMatchObject({
      total: 30 * day,
      currentRate: "night",
      latestTotalUpdate: local("20:00:00"),
    });
    expect((await prisma.parking.findUniqueOrThrow({ where: { id: other.id } })).total).toBe(120 * day);
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: booked.id } })).toMatchObject({ total: 0, status: "booked" });
    expect(jobTime("hourly-totals-refresh")).toEqual(local("21:00:00"));
  });
});
