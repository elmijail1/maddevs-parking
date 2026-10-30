import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { env } from "../src/env";
import { bookingJobTimes, scheduleExistingBookings } from "../src/services/booking-jobs";
import { cancelAllJobs, runJobsDueBy } from "../src/services/scheduler";
import { createParking, createTestApp, getSpace, placeVehicle, resetDatabase, setSpace, signUp } from "./helpers";

const { app, logs, warnings } = createTestApp();
const regNumber = "AA111AA";
const bookedAt = new Date("2026-10-30T10:00:00+04:00");
const minutes = (count: number) => new Date(bookedAt.getTime() + count * 60_000);
const emailFetch = vi.spyOn(globalThis, "fetch");
let cookie: string;

function inject(method: "GET" | "POST" | "DELETE", url: string, payload?: unknown, as = cookie) {
  return app.inject({ method, url, headers: as ? { cookie: as } : {}, ...(payload ? { payload: payload as object } : {}) });
}

const device = (url: string, payload: object) =>
  app.inject({ method: "POST", url, headers: { "x-api-key": env.SERVICE_API_KEY }, payload });

async function addCar(as = cookie) {
  const response = await inject("POST", "/api/cars", { regNumber, vin: "VIN12345", certificateNumber: "CERT1" }, as);
  return response.json().car as { id: string };
}

async function bookA1() {
  const car = await addCar();
  const spaceId = (await getSpace("A1")).id;
  return (await inject("POST", "/api/bookings", { spaceId, carId: car.id })).json().booking as { parkingId: string };
}

const sentEmails = () =>
  emailFetch.mock.calls.map(([url, init]) => ({
    url: String(url),
    apiKey: (init?.headers as Record<string, string>)["x-api-key"],
    body: JSON.parse(String(init?.body)),
  }));

const runDue = (time: Date) => {
  vi.setSystemTime(time);
  return runJobsDueBy(time, app.log);
};

beforeEach(async () => {
  cancelAllJobs();
  await resetDatabase();
  logs.length = 0;
  emailFetch.mockReset();
  emailFetch.mockImplementation(async () => Response.json({ status: "sent" }));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(bookedAt);
  cookie = await signUp(app);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  emailFetch.mockRestore();
  await app.close();
  await prisma.$disconnect();
});

describe("scheduling", () => {
  it("schedules the reminder 10 minutes before the expiry and the expiry 30 seconds after it", async () => {
    const { parkingId } = await bookA1();

    expect(bookingJobTimes(parkingId)).toEqual({
      reminder: minutes(5),
      expiry: new Date(minutes(15).getTime() + 30_000),
    });
  });

  it("schedules both for a booking the bar post makes for a car without one", async () => {
    await device("/api/new-entrance", { regNumber });
    const parking = await prisma.parking.findFirstOrThrow({ where: { status: "booked" } });

    expect(bookingJobTimes(parking.id)).toEqual({ reminder: minutes(5), expiry: new Date(minutes(15).getTime() + 30_000) });
  });

  it("cancels both when the car enters", async () => {
    const { parkingId } = await bookA1();

    await device("/api/new-parking", { regNumber, time: minutes(3).toISOString() });

    expect(bookingJobTimes(parkingId)).toEqual({ reminder: undefined, expiry: undefined });
  });

  it("cancels both when the booking is cancelled", async () => {
    const { parkingId } = await bookA1();

    await inject("POST", `/api/bookings/${parkingId}/cancel`);

    expect(bookingJobTimes(parkingId)).toEqual({ reminder: undefined, expiry: undefined });
  });

  it("postpones the expiry by 2 minutes when the bar post lets the booked car in, without changing the expiry time", async () => {
    const { parkingId } = await bookA1();
    vi.setSystemTime(new Date(minutes(15).getTime() + 10_000));

    await device("/api/new-entrance", { regNumber });

    expect(bookingJobTimes(parkingId).expiry).toEqual(new Date(minutes(17).getTime() + 10_000));
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parkingId } })).toMatchObject({ activeSince: minutes(15) });
  });

  it("doesn't move the expiry earlier when the car is let in long before it", async () => {
    const { parkingId } = await bookA1();
    vi.setSystemTime(minutes(2));

    await device("/api/new-entrance", { regNumber });

    expect(bookingJobTimes(parkingId).expiry).toEqual(new Date(minutes(15).getTime() + 30_000));
  });
});

describe("the reminder", () => {
  it("emails every user who has the car on their list after 5 minutes", async () => {
    const sharerCookie = await signUp(app, "sharer@example.com");
    await addCar(sharerCookie);
    const formerCookie = await signUp(app, "former@example.com");
    const formerCar = await addCar(formerCookie);
    await inject("DELETE", `/api/cars/${formerCar.id}`, undefined, formerCookie);
    await bookA1();

    await runDue(minutes(4));
    expect(sentEmails()).toEqual([]);
    await runDue(minutes(5));

    const emails = sentEmails();
    expect(emails.map((e) => e.body.to).sort()).toEqual(["driver@example.com", "sharer@example.com"]);
    expect(emails[0]).toEqual({
      url: new URL("/emails", env.EMAIL_SERVICE_URL).href,
      apiKey: env.SERVICE_API_KEY,
      body: {
        to: expect.any(String),
        subject: "Your booking of A1 expires at 10:15",
        text: "Your booking for AA111AA expires at 10:15. Please enter the parking lot before then.",
      },
    });
  });

  it("is also sent for a booking the bar post made, to the users who have the car", async () => {
    await addCar();
    await device("/api/new-entrance", { regNumber });

    await runDue(minutes(5));

    expect(sentEmails().map((e) => e.body.to)).toEqual(["driver@example.com"]);
  });

  it("isn't sent when nobody has the car on their list", async () => {
    await device("/api/new-entrance", { regNumber: "WALKIN1" });

    await runDue(minutes(5));

    expect(sentEmails()).toEqual([]);
  });

  it("isn't sent when the car has entered", async () => {
    await bookA1();
    await device("/api/new-parking", { regNumber, time: minutes(3).toISOString() });

    await runDue(minutes(16));

    expect(sentEmails()).toEqual([]);
  });

  it("logs a warning when the email service is offline, and the booking still expires", async () => {
    emailFetch.mockImplementation(async () => Promise.reject(new TypeError("fetch failed")));
    await bookA1();

    await runDue(minutes(5));
    expect(warnings().map((w) => w.msg)).toEqual(["Booking reminder couldn't be sent"]);

    await runDue(minutes(16));
    expect(await getSpace("A1")).toMatchObject({ status: "vacant", relatedVehicle: null });
  });
});

describe("the expiry", () => {
  it("cancels the booking 30 seconds after it expires and frees the space", async () => {
    const { parkingId } = await bookA1();

    await runDue(new Date(minutes(15).getTime() + 29_000));
    expect(await getSpace("A1")).toMatchObject({ status: "booked" });

    await runDue(new Date(minutes(15).getTime() + 30_000));

    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parkingId } })).toMatchObject({
      status: "cancelled",
      activeSince: minutes(15),
    });
    expect(await getSpace("A1")).toMatchObject({ status: "vacant", relatedVehicle: null });
    expect((await inject("GET", "/api/my-parkings")).json().parkings).toEqual([]);
  });

  it("leaves a booking alone that the car turned into a parking", async () => {
    const { parkingId } = await bookA1();
    await device("/api/new-parking", { regNumber, time: minutes(14).toISOString() });

    await runDue(minutes(20));

    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parkingId } })).toMatchObject({ status: "active" });
    expect(await getSpace("A1")).toMatchObject({ status: "occupied", relatedVehicle: regNumber });
  });

  it("waits for the postponed time when the car was let in at the last moment", async () => {
    const { parkingId } = await bookA1();
    vi.setSystemTime(new Date(minutes(15).getTime() + 20_000));
    await device("/api/new-entrance", { regNumber });

    await runDue(minutes(16));
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parkingId } })).toMatchObject({ status: "booked" });

    await device("/api/new-parking", { regNumber, time: minutes(16).toISOString() });
    await runDue(minutes(30));
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parkingId } })).toMatchObject({ status: "active" });
  });
});

describe("after a restart", () => {
  it("reschedules the existing bookings, expiring overdue ones and skipping missed reminders", async () => {
    await addCar();
    await setSpace("A1", "booked", regNumber);
    const fresh = await createParking("A1", regNumber, "booked", minutes(15));
    await setSpace("B1", "booked", "OVERDUE1");
    const overdue = await createParking("B1", "OVERDUE1", "booked", minutes(-1));
    await setSpace("B2", "booked", "LATE1");
    const late = await createParking("B2", "LATE1", "booked", minutes(8));
    await placeVehicle("A3", "PARKED1", "occupied");
    cancelAllJobs();

    await scheduleExistingBookings(app.log, bookedAt);

    expect(bookingJobTimes(fresh.id)).toEqual({ reminder: minutes(5), expiry: new Date(minutes(15).getTime() + 30_000) });
    expect(bookingJobTimes(late.id)).toEqual({ reminder: undefined, expiry: new Date(minutes(8).getTime() + 30_000) });
    await runDue(bookedAt);
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: overdue.id } })).toMatchObject({ status: "cancelled" });
    expect(await getSpace("B1")).toMatchObject({ status: "vacant" });
    expect(await getSpace("A3")).toMatchObject({ status: "occupied" });
  });
});
