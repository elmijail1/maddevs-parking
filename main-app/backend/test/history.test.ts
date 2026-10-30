import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { createPayment, createTestApp, getSpace, resetDatabase, signUp } from "./helpers";

const { app } = createTestApp();
const regNumber = "AA111AA";
const minutesAfter = (start: Date, minutes: number) => new Date(start.getTime() + minutes * 60_000);
const start = new Date("2026-10-30T06:00:00Z");
let cookie: string;

function inject(method: "GET" | "POST" | "DELETE", url: string, payload?: unknown, as = cookie) {
  return app.inject({ method, url, headers: as ? { cookie: as } : {}, ...(payload ? { payload: payload as object } : {}) });
}

async function addCar(car = regNumber, as = cookie, displayName?: string) {
  const body = { regNumber: car, vin: "VIN12345", certificateNumber: "CERT1", ...(displayName ? { displayName } : {}) };
  return (await inject("POST", "/api/cars", body, as)).json().car as { id: string };
}

async function makeParking(
  createdAt: Date,
  status: "booked" | "active" | "cancelled" | "finished" = "finished",
  car = regNumber,
  space = "A1",
) {
  const activeSince = minutesAfter(createdAt, 10);
  return prisma.parking.create({
    data: {
      status,
      vehicleRegNumber: car,
      spaceId: (await getSpace(space)).id,
      activeSince,
      currentRate: "day",
      latestRateChange: activeSince,
      latestTotalUpdate: activeSince,
      createdAt,
    },
  });
}

const history = async (cursor?: string, as = cookie) =>
  inject("GET", `/api/history${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`, undefined, as);
const ids = async (cursor?: string) =>
  (await history(cursor)).json().parkings.map((p: { parkingId: string }) => p.parkingId);

beforeEach(async () => {
  await resetDatabase();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(start);
  cookie = await signUp(app);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("GET /api/history", () => {
  it("shows the cards with the right date, status and payment", async () => {
    await addCar(regNumber, cookie, "My Jeep");
    const paid = await makeParking(minutesAfter(start, 1));
    await prisma.payment.create({
      data: { parkingId: paid.id, total: 284, status: "success", updatedAt: minutesAfter(start, 90) },
    });
    await createPayment(paid.id, "failed");
    const unpaid = await makeParking(minutesAfter(start, 2));
    const cancelled = await makeParking(minutesAfter(start, 3), "cancelled");
    const active = await makeParking(minutesAfter(start, 4), "active", regNumber, "A2");

    const response = await history();

    expect(response.statusCode).toBe(200);
    const card = (id: string, status: string, date: Date, payment: unknown) => ({
      parkingId: id,
      regNumber,
      carName: "My Jeep",
      spaceName: id === active.id ? "A2" : "A1",
      status,
      date: date.toISOString(),
      payment,
    });
    expect(response.json()).toEqual({
      nextCursor: null,
      parkings: [
        card(active.id, "active", active.activeSince, null),
        card(cancelled.id, "cancelled", cancelled.createdAt, null),
        card(unpaid.id, "finished", unpaid.activeSince, { status: "unpaid" }),
        card(paid.id, "finished", paid.activeSince, {
          status: "paid",
          total: 284,
          paidAt: minutesAfter(start, 90).toISOString(),
        }),
      ],
    });
  });

  it("shows the latest 10 first and pages through the rest", async () => {
    await addCar();
    const parkings = [];
    for (let index = 0; index < 23; index++) {
      parkings.push(await makeParking(minutesAfter(start, index + 1)));
    }
    const newestFirst = parkings.reverse().map((p) => p.id);

    const loaded: string[] = [];
    const cursors: (string | null)[] = [];
    let cursor: string | undefined;
    do {
      const page = (await history(cursor)).json();
      loaded.push(...page.parkings.map((p: { parkingId: string }) => p.parkingId));
      cursors.push(page.nextCursor);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(loaded).toEqual(newestFirst);
    expect(cursors.map((c) => c !== null)).toEqual([true, true, false]);
  });

  it("has no next cursor for exactly 10 parkings, and one for 11", async () => {
    await addCar();
    for (let index = 0; index < 10; index++) {
      await makeParking(minutesAfter(start, index + 1));
    }
    expect((await history()).json().nextCursor).toBeNull();

    await makeParking(minutesAfter(start, 20));
    expect((await history()).json().nextCursor).not.toBeNull();
  });

  it("doesn't repeat or skip parkings when a new one appears while scrolling", async () => {
    await addCar();
    for (let index = 0; index < 12; index++) {
      await makeParking(minutesAfter(start, index + 1));
    }
    const first = (await history()).json();

    await makeParking(minutesAfter(start, 30));
    const second = (await history(first.nextCursor)).json();

    const all = [...first.parkings, ...second.parkings].map((p: { parkingId: string }) => p.parkingId);
    expect(new Set(all).size).toBe(12);
    expect(second.nextCursor).toBeNull();
  });

  it("keeps parkings created at the same moment in a stable order across pages", async () => {
    await addCar();
    for (let index = 0; index < 15; index++) {
      await makeParking(minutesAfter(start, 1));
    }

    const first = (await history()).json();
    const second = (await history(first.nextCursor)).json();

    const all = [...first.parkings, ...second.parkings].map((p: { parkingId: string }) => p.parkingId);
    expect(new Set(all).size).toBe(15);
  });

  it("doesn't show parkings from before the car was added", async () => {
    await makeParking(minutesAfter(start, -60));
    vi.setSystemTime(minutesAfter(start, -30));
    await addCar();
    const after = await makeParking(minutesAfter(start, -20));

    expect(await ids()).toEqual([after.id]);
  });

  it("hides a removed car's parkings and only shows new ones after re-adding it", async () => {
    const car = await addCar();
    const before = await makeParking(minutesAfter(start, 1));
    expect(await ids()).toEqual([before.id]);

    vi.setSystemTime(minutesAfter(start, 10));
    await inject("DELETE", `/api/cars/${car.id}`);
    const whileRemoved = await makeParking(minutesAfter(start, 20));
    expect(await ids()).toEqual([]);

    vi.setSystemTime(minutesAfter(start, 30));
    await addCar();
    const afterReAdding = await makeParking(minutesAfter(start, 40));

    expect(await ids()).toEqual([afterReAdding.id]);
    expect([before.id, whileRemoved.id]).not.toContain(afterReAdding.id);
  });

  it("shows only the user's own cars, each with the user's own name for it", async () => {
    await addCar(regNumber, cookie, "Mine");
    const sharerCookie = await signUp(app, "sharer@example.com");
    await addCar(regNumber, sharerCookie, "Brother's car");
    await makeParking(minutesAfter(start, 1));
    await makeParking(minutesAfter(start, 2), "finished", "STRANGER1", "B1");

    expect((await history()).json().parkings.map((p: { carName: string }) => p.carName)).toEqual(["Mine"]);
    expect((await history(undefined, sharerCookie)).json().parkings.map((p: { carName: string }) => p.carName)).toEqual([
      "Brother's car",
    ]);
  });

  it("is empty for a user without cars", async () => {
    await makeParking(minutesAfter(start, 1));

    expect((await history()).json()).toEqual({ parkings: [], nextCursor: null });
  });

  it.each(["abc", "2", "2026-10-30_x"])("rejects the cursor %j", async (cursor) => {
    expect((await history(cursor)).statusCode).toBe(400);
  });

  it("requires a logged-in user", async () => {
    expect((await history(undefined, "")).statusCode).toBe(401);
  });
});
