import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { createTestApp, resetDatabase, signUp } from "./helpers";

const { app } = createTestApp();
const car = { regNumber: "AA111AA", vin: "1HGCM82633A004352", certificateNumber: "CERT123" };
let cookie: string;

function request(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown, as = cookie) {
  return app.inject({ method, url, headers: as ? { cookie: as } : {}, ...(payload ? { payload: payload as object } : {}) });
}

const addCar = (payload: unknown, as?: string) => request("POST", "/api/cars", payload, as);
const listCars = async (as?: string) => (await request("GET", "/api/cars", undefined, as)).json().cars;
const userId = async (email = "driver@example.com") => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

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

describe("POST /api/cars", () => {
  it("creates the vehicle and links it to the user when the car is new", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));

    const response = await addCar({
      regNumber: " aa111aa",
      vin: car.vin.toLowerCase(),
      certificateNumber: "cert123",
      displayName: "  My   Jeep ",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      car: { id: expect.any(String), regNumber: "AA111AA", displayName: "My Jeep", addedAt: "2026-10-29T10:00:00.000Z" },
    });
    expect(await prisma.vehicle.findMany()).toEqual([
      expect.objectContaining({ regNumber: "AA111AA", vin: car.vin, registrationCertificateNumber: "CERT123" }),
    ]);
    expect(await prisma.userVehicle.findMany()).toEqual([
      expect.objectContaining({ userId: await userId(), vehicleRegNumber: "AA111AA", status: "active", displayName: "My Jeep" }),
    ]);
  });

  it("stores the default display name when none is given", async () => {
    const response = await addCar(car);

    expect(response.json().car.displayName).toBe("New car");
    expect(await prisma.userVehicle.findFirst()).toMatchObject({ displayName: "New car" });
  });

  it("only links an existing vehicle when all three values match", async () => {
    await addCar(car, await signUp(app, "owner@example.com"));

    const response = await addCar({ ...car, displayName: "Shared car" });

    expect(response.statusCode).toBe(201);
    expect(await prisma.vehicle.count()).toBe(1);
    expect(await prisma.userVehicle.count()).toBe(2);
    expect(await listCars()).toEqual([expect.objectContaining({ regNumber: car.regNumber, displayName: "Shared car" })]);
  });

  it.each([
    ["VIN", { vin: "WRONGVIN12345" }],
    ["certificate number", { certificateNumber: "OTHER99" }],
  ])("creates nothing when the vehicle exists but the %s doesn't match", async (_, override) => {
    await addCar(car, await signUp(app, "owner@example.com"));

    const response = await addCar({ ...car, ...override });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "vehicle_mismatch" });
    expect(await prisma.vehicle.count()).toBe(1);
    expect(await prisma.userVehicle.count()).toBe(1);
    expect(await prisma.vehicle.findFirst()).toMatchObject({ vin: car.vin, registrationCertificateNumber: car.certificateNumber });
  });

  it("rejects a car that is already in the user's list", async () => {
    await addCar(car);

    const response = await addCar({ ...car, displayName: "Again" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "already_added" });
    expect(await prisma.userVehicle.count()).toBe(1);
    expect(await listCars()).toEqual([expect.objectContaining({ displayName: "New car" })]);
  });

  it("handles the same new car added twice at once", async () => {
    const responses = await Promise.all([addCar(car), addCar(car)]);

    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await prisma.vehicle.count()).toBe(1);
    expect(await prisma.userVehicle.count()).toBe(1);
  });

  describe("the limit of 20 active cars", () => {
    async function addCars(count: number) {
      const added = [];
      for (let index = 0; index < count; index++) {
        const regNumber = `LIM${String(index).padStart(2, "0")}`;
        added.push((await addCar({ regNumber, vin: `VIN${regNumber}`, certificateNumber: `C${regNumber}` })).json().car);
      }
      return added as { id: string; regNumber: string }[];
    }

    it("refuses a 21st car and creates nothing for it", async () => {
      await addCars(20);

      const response = await addCar(car);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: "car_limit_reached" });
      expect(await prisma.userVehicle.count({ where: { status: "active" } })).toBe(20);
      expect(await prisma.vehicle.findUnique({ where: { regNumber: car.regNumber } })).toBeNull();
    });

    it("also counts re-adding a removed car, and allows it after removing another", async () => {
      const [first, second] = await addCars(20);
      await request("DELETE", `/api/cars/${first!.id}`);
      await addCar(car);

      const firstAgain = { regNumber: first!.regNumber, vin: `VIN${first!.regNumber}`, certificateNumber: `C${first!.regNumber}` };
      const reAdding = await addCar(firstAgain);
      expect(reAdding.json()).toEqual({ error: "car_limit_reached" });

      await request("DELETE", `/api/cars/${second!.id}`);
      const afterRemoving = await addCar(firstAgain);
      expect(afterRemoving.statusCode).toBe(201);
    });

    it("can't be passed by adding several cars at once", async () => {
      await addCars(18);

      const responses = await Promise.all(
        ["RACE1", "RACE2", "RACE3", "RACE4"].map((regNumber) =>
          addCar({ regNumber, vin: `VIN${regNumber}`, certificateNumber: `C${regNumber}` }),
        ),
      );

      expect(responses.filter((r) => r.statusCode === 201)).toHaveLength(2);
      expect(await prisma.userVehicle.count({ where: { status: "active" } })).toBe(20);
    });

    it("is per user", async () => {
      await addCars(20);

      expect((await addCar(car, await signUp(app, "other@example.com"))).statusCode).toBe(201);
    });
  });

  it.each([
    ["no body", undefined],
    ["a missing VIN", { regNumber: car.regNumber, certificateNumber: car.certificateNumber }],
    ["a too short registration number", { ...car, regNumber: "AB" }],
    ["a too long registration number", { ...car, regNumber: "A".repeat(16) }],
    ["a too short VIN", { ...car, vin: "1HGC" }],
    ["a too long VIN", { ...car, vin: "1".repeat(18) }],
    ["a too long certificate number", { ...car, certificateNumber: "C".repeat(16) }],
    ["a registration number with a space", { ...car, regNumber: "AA 111" }],
    ["a VIN with a non-Latin letter", { ...car, vin: "ЖHGCM82633A" }],
    ["an empty display name", { ...car, displayName: " " }],
    ["a too long display name", { ...car, displayName: "x".repeat(21) }],
    ["a display name with other characters", { ...car, displayName: "Jeep!" }],
  ])("rejects %s and creates nothing", async (_, body) => {
    const response = await addCar(body);

    expect(response.statusCode).toBe(400);
    expect(await prisma.vehicle.count()).toBe(0);
    expect(await prisma.userVehicle.count()).toBe(0);
  });
});

describe("GET /api/cars", () => {
  it("lists only the user's active cars, latest first", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (const [index, regNumber] of ["FIRST1", "SECOND2", "THIRD3"].entries()) {
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 29, 10 + index)));
      await addCar({ ...car, regNumber });
    }
    await addCar({ ...car, regNumber: "OTHER9" }, await signUp(app, "other@example.com"));
    const second = (await listCars()).find((c: { regNumber: string }) => c.regNumber === "SECOND2");
    await request("DELETE", `/api/cars/${second.id}`);

    expect((await listCars()).map((c: { regNumber: string }) => c.regNumber)).toEqual(["THIRD3", "FIRST1"]);
  });

  it("loads 10 cars at a time, following the cursor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const regNumbers = Array.from({ length: 13 }, (_, index) => `CAR${String(index).padStart(2, "0")}`);
    for (const [index, car] of regNumbers.entries()) {
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 29, 10, index)));
      await addCar({ regNumber: car, vin: `VIN${car}`, certificateNumber: `C${car}` });
    }

    const first = (await request("GET", "/api/cars")).json();
    const second = (await request("GET", `/api/cars?cursor=${encodeURIComponent(first.nextCursor)}`)).json();

    expect(first.cars).toHaveLength(10);
    expect(second).toMatchObject({ nextCursor: null });
    expect([...first.cars, ...second.cars].map((c: { regNumber: string }) => c.regNumber)).toEqual(
      [...regNumbers].reverse(),
    );
  });

  it("rejects a malformed cursor", async () => {
    expect((await request("GET", "/api/cars?cursor=abc")).statusCode).toBe(400);
  });

  it("requires a logged-in user", async () => {
    expect((await request("GET", "/api/cars", undefined, "")).statusCode).toBe(401);
  });
});

describe("DELETE /api/cars/:id", () => {
  it("only deactivates the link, keeps the vehicle and clears the display name", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
    const { car: added } = (await addCar({ ...car, displayName: "My Jeep" })).json();
    vi.setSystemTime(new Date("2026-10-29T11:00:00Z"));

    const response = await request("DELETE", `/api/cars/${added.id}`);

    expect(response.statusCode).toBe(204);
    expect(await prisma.vehicle.count()).toBe(1);
    expect(await prisma.userVehicle.findUniqueOrThrow({ where: { id: added.id } })).toMatchObject({
      status: "inactive",
      displayName: null,
      latestStatusChange: new Date("2026-10-29T11:00:00Z"),
    });
    expect(await listCars()).toEqual([]);
  });

  it("re-adding a removed car reactivates the same link with a fresh date and the default name", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
    const { car: added } = (await addCar({ ...car, displayName: "My Jeep" })).json();
    await addCar({ ...car, regNumber: "NEWER2" });
    await request("DELETE", `/api/cars/${added.id}`);
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));

    const response = await addCar(car);

    expect(response.statusCode).toBe(201);
    expect(response.json().car).toEqual({
      id: added.id,
      regNumber: car.regNumber,
      displayName: "New car",
      addedAt: "2026-10-29T12:00:00.000Z",
    });
    expect(await prisma.vehicle.count()).toBe(2);
    expect(await prisma.userVehicle.count()).toBe(2);
    expect((await listCars()).map((c: { regNumber: string }) => c.regNumber)).toEqual([car.regNumber, "NEWER2"]);
  });

  it("re-adding a removed car still checks the VIN and certificate number", async () => {
    const { car: added } = (await addCar(car)).json();
    await request("DELETE", `/api/cars/${added.id}`);

    const response = await addCar({ ...car, vin: "WRONGVIN12345" });

    expect(response.json()).toEqual({ error: "vehicle_mismatch" });
    expect(await listCars()).toEqual([]);
  });

  it("can't remove another user's car", async () => {
    const otherCookie = await signUp(app, "other@example.com");
    const { car: theirs } = (await addCar(car, otherCookie)).json();

    const response = await request("DELETE", `/api/cars/${theirs.id}`);

    expect(response.statusCode).toBe(404);
    expect(await listCars(otherCookie)).toHaveLength(1);
  });
});

describe("PATCH /api/cars/:id", () => {
  it("changes the display name", async () => {
    const { car: added } = (await addCar(car)).json();

    const response = await request("PATCH", `/api/cars/${added.id}`, { displayName: " Work   van " });

    expect(response.statusCode).toBe(200);
    expect(response.json().car).toEqual({ ...added, displayName: "Work van" });
  });

  it.each([
    ["an empty name", " "],
    ["a too long name", "x".repeat(21)],
    ["other characters", "Van #2"],
  ])("rejects %s", async (_, displayName) => {
    const { car: added } = (await addCar(car)).json();

    const response = await request("PATCH", `/api/cars/${added.id}`, { displayName });

    expect(response.statusCode).toBe(400);
    expect(await listCars()).toEqual([expect.objectContaining({ displayName: "New car" })]);
  });

  it("can't rename another user's or a removed car", async () => {
    const { car: theirs } = (await addCar(car, await signUp(app, "other@example.com"))).json();
    const { car: removed } = (await addCar({ ...car, regNumber: "GONE1" })).json();
    await request("DELETE", `/api/cars/${removed.id}`);

    for (const id of [theirs.id, removed.id]) {
      expect((await request("PATCH", `/api/cars/${id}`, { displayName: "Mine" })).statusCode).toBe(404);
    }
    expect(await prisma.userVehicle.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ displayName: "New car" });
  });
});
