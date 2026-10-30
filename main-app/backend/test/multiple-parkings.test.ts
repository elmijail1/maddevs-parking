import { getRatePerMinuteCents } from "@parking/shared";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { env } from "../src/env";
import { cancelAllJobs } from "../src/services/scheduler";
import { createTestApp, getSpace, resetDatabase, signUp } from "./helpers";

const day = getRatePerMinuteCents("day");
const { app } = createTestApp();
const local = (time: string) => new Date(`2026-10-30T${time}+04:00`);
let cookie: string;

function inject(method: "GET" | "POST" | "DELETE", url: string, payload?: unknown) {
  return app.inject({ method, url, headers: { cookie }, ...(payload ? { payload: payload as object } : {}) });
}

async function addCar(regNumber: string) {
  return (await inject("POST", "/api/cars", { regNumber, vin: "VIN12345", certificateNumber: "CERT1" })).json().car as {
    id: string;
  };
}

async function book(spaceName: string, carId: string) {
  const response = await inject("POST", "/api/bookings", { spaceId: (await getSpace(spaceName)).id, carId });
  return response.json().booking as { parkingId: string };
}

async function enter(regNumber: string) {
  const headers = { "x-api-key": env.SERVICE_API_KEY };
  await app.inject({ method: "POST", url: "/api/new-entrance", headers, payload: { regNumber } });
  await app.inject({
    method: "POST",
    url: "/api/new-parking",
    headers,
    payload: { regNumber, time: new Date().toISOString() },
  });
}

const myParkings = async () =>
  (await inject("GET", "/api/my-parkings")).json().parkings.map((p: { spaceName: string; status: string }) => [
    p.spaceName,
    p.status,
  ]);

beforeEach(async () => {
  cancelAllJobs();
  await resetDatabase();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(local("10:00:00"));
  cookie = await signUp(app);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("one user with several cars", () => {
  it("books two spaces and cancels one of them without touching the other", async () => {
    const jeep = await addCar("AA111AA");
    const van = await addCar("BB222BB");
    const jeepBooking = await book("A1", jeep.id);
    const vanBooking = await book("B2", van.id);
    expect(await myParkings()).toEqual([
      ["A1", "booked"],
      ["B2", "booked"],
    ]);

    expect((await inject("POST", `/api/bookings/${vanBooking.parkingId}/cancel`)).statusCode).toBe(204);

    expect(await myParkings()).toEqual([["A1", "booked"]]);
    expect(await getSpace("A1")).toMatchObject({ status: "booked", relatedVehicle: "AA111AA" });
    expect(await getSpace("B2")).toMatchObject({ status: "vacant", relatedVehicle: null });
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: jeepBooking.parkingId } })).toMatchObject({
      status: "booked",
    });
  });

  it("has two cars parked and refreshes each one's own total", async () => {
    await addCar("AA111AA");
    await addCar("BB222BB");
    await enter("AA111AA");
    vi.setSystemTime(local("10:20:00"));
    await enter("BB222BB");
    vi.setSystemTime(local("11:00:00"));
    const parkings = await prisma.parking.findMany({ where: { status: "active" }, orderBy: { createdAt: "asc" } });

    const totals = [];
    for (const parking of parkings) {
      totals.push((await inject("POST", `/api/parkings/${parking.id}/refresh`)).json().parking.total);
    }

    expect(totals).toEqual([60 * day, 40 * day]);
    expect(await myParkings()).toEqual([
      ["A1", "active"],
      ["A2", "active"],
    ]);
  });

  it("has one car booked and another parked: cancelling works for one, the total for the other", async () => {
    const jeep = await addCar("AA111AA");
    await addCar("BB222BB");
    await enter("BB222BB");
    const booking = await book("B3", jeep.id);
    vi.setSystemTime(local("10:30:00"));
    const parked = await prisma.parking.findFirstOrThrow({ where: { status: "active" } });

    expect((await inject("POST", `/api/parkings/${booking.parkingId}/refresh`)).statusCode).toBe(409);
    expect((await inject("POST", `/api/bookings/${parked.id}/cancel`)).statusCode).toBe(409);
    expect((await inject("POST", `/api/parkings/${parked.id}/refresh`)).json().parking.total).toBe(30 * day);
    expect((await inject("POST", `/api/bookings/${booking.parkingId}/cancel`)).statusCode).toBe(204);

    expect(await myParkings()).toEqual([["A1", "active"]]);
  });
});
