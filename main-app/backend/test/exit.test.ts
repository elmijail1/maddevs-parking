import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { env } from "../src/env";
import { createParking, createPayment, createTestApp, placeVehicle, resetDatabase, setSpace } from "./helpers";

const { app, logs, warnings, criticals } = createTestApp();
const regNumber = "XX000XX";
const terminalFetch = vi.spyOn(globalThis, "fetch");

function inject(method: "GET" | "POST", url: string, body?: unknown, apiKey: string | null = env.SERVICE_API_KEY) {
  return app.inject({
    method,
    url,
    headers: apiKey ? { "x-api-key": apiKey } : {},
    ...(body === undefined ? {} : { payload: body as object }),
  });
}

const postNewExit = (body: unknown) => inject("POST", "/api/new-exit", body);
const postPaymentResult = (body: unknown, apiKey?: string | null) => inject("POST", "/api/payment-result", body, apiKey);
const getPaymentStatus = (paymentId: string) => inject("GET", `/api/payments/${paymentId}`);

async function parkVehicle(vehicle = regNumber, displayName = "A1") {
  await placeVehicle(displayName, vehicle, "occupied");
  return prisma.parking.findFirstOrThrow({ where: { vehicleRegNumber: vehicle, status: "active" } });
}

function sentSessions() {
  return terminalFetch.mock.calls.map(([url, init]) => ({
    url: String(url),
    apiKey: (init?.headers as Record<string, string>)["x-api-key"],
    body: JSON.parse(init?.body as string),
  }));
}

beforeEach(async () => {
  await resetDatabase();
  logs.length = 0;
  terminalFetch.mockReset();
  terminalFetch.mockImplementation(async () => new Response(null, { status: 202 }));
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  terminalFetch.mockRestore();
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/new-exit", () => {
  it("charges the parking up to now, creates a pending payment and sends it to the terminal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T20:30:30+04:00"));
    await setSpace("A1", "occupied", regNumber);
    const parking = await createParking("A1", regNumber, "active", new Date("2026-10-28T19:30:00+04:00"));
    await prisma.parking.update({ where: { id: parking.id }, data: { total: 100 } });

    const response = await postNewExit({ regNumber });

    const expectedTotal = 100 + 30 * 20 + 30 * 10;
    const payments = await prisma.payment.findMany();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ parkingId: parking.id, status: "pending", total: expectedTotal });
    expect(response.json()).toEqual({ status: "awaiting_payment", paymentId: payments[0]!.id, total: expectedTotal });
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parking.id } })).toMatchObject({
      status: "active",
      total: expectedTotal,
      currentRate: "night",
      latestRateChange: new Date("2026-10-28T20:00:00+04:00"),
      latestTotalUpdate: new Date("2026-10-28T20:30:00+04:00"),
    });
    expect(sentSessions()).toEqual([
      {
        url: new URL("/sessions", env.PAYMENT_TERMINAL_URL).href,
        apiKey: env.SERVICE_API_KEY,
        body: { paymentId: payments[0]!.id, total: expectedTotal },
      },
    ]);
  });

  it.each([{}, { regNumber: "" }, { regNumber: "A".repeat(16) }, { regNumber: 123 }])(
    "rejects an invalid registration number: %j",
    async (body) => {
      const response = await postNewExit(body);

      expect(response.statusCode).toBe(400);
      expect(await prisma.payment.count()).toBe(0);
      expect(terminalFetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["no parking", async () => {}],
    ["only a booked parking", () => placeVehicle("A1", regNumber, "booked")],
  ])("denies the exit with a critical log when the car has %s", async (_, arrange) => {
    await arrange();

    const response = await postNewExit({ regNumber });

    expect(response.json()).toEqual({ status: "denied", reason: "no_active_parking" });
    expect(await prisma.payment.count()).toBe(0);
    expect(terminalFetch).not.toHaveBeenCalled();
    expect(criticals()).toHaveLength(1);
  });

  it.each([
    ["is unreachable", async () => Promise.reject(new TypeError("fetch failed"))],
    ["responds with an error", async () => new Response(null, { status: 500 })],
  ])("fails the payment with a critical log when the terminal %s", async (_, terminalResponse) => {
    terminalFetch.mockImplementation(terminalResponse);
    await parkVehicle();

    const response = await postNewExit({ regNumber });

    expect(response.json()).toEqual({ status: "denied", reason: "terminal_unavailable" });
    const payments = await prisma.payment.findMany();
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe("failed");
    expect(criticals()).toHaveLength(1);
  });

  it("returns the existing pending payment when the same car asks again", async () => {
    await parkVehicle();
    const first = (await postNewExit({ regNumber })).json();

    const second = (await postNewExit({ regNumber })).json();

    expect(second).toEqual(first);
    expect(await prisma.payment.count()).toBe(1);
    expect(terminalFetch).toHaveBeenCalledOnce();
  });

  it("replaces a stale pending payment of the same car with a new one", async () => {
    const parking = await parkVehicle();
    const stale = await createPayment(parking.id, "pending", new Date(Date.now() - 6 * 60_000));

    const response = await postNewExit({ regNumber });

    expect(response.json().paymentId).not.toBe(stale.id);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: stale.id } })).toMatchObject({ status: "cancelled" });
    expect(await prisma.payment.count({ where: { status: "pending" } })).toBe(1);
  });

  it("cancels another car's pending payment in favor of the new exit", async () => {
    const otherParking = await parkVehicle("OTHER", "A2");
    const otherPayment = await createPayment(otherParking.id, "pending");
    await parkVehicle();

    const response = await postNewExit({ regNumber });

    expect(response.json().status).toBe("awaiting_payment");
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: otherPayment.id } })).toMatchObject({
      status: "cancelled",
    });
    expect(warnings()).toHaveLength(1);
  });

  it("creates a new payment after a failed or cancelled one", async () => {
    const parking = await parkVehicle();
    await createPayment(parking.id, "failed");
    await createPayment(parking.id, "cancelled");

    const response = await postNewExit({ regNumber });

    expect(response.json().status).toBe("awaiting_payment");
    expect(await prisma.payment.count({ where: { parkingId: parking.id } })).toBe(3);
  });
});

describe("POST /api/payment-result", () => {
  async function startPayment() {
    const parking = await parkVehicle();
    const { paymentId } = (await postNewExit({ regNumber })).json();
    logs.length = 0;
    return { parking, paymentId: paymentId as string };
  }

  it("marks the payment successful and finishes the parking", async () => {
    const { parking, paymentId } = await startPayment();

    const response = await postPaymentResult({ paymentId, status: "success" });

    expect(response.statusCode).toBe(204);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({ status: "success" });
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parking.id } })).toMatchObject({ status: "finished" });
    expect((await getPaymentStatus(paymentId)).json()).toEqual({ status: "success" });
    expect(warnings()).toHaveLength(0);
    expect(criticals()).toHaveLength(0);
  });

  it.each([
    ["cancelled", warnings],
    ["failed", criticals],
  ] as const)("marks the payment %s and keeps the parking active", async (status, expectedLogs) => {
    const { parking, paymentId } = await startPayment();

    const response = await postPaymentResult({ paymentId, status });

    expect(response.statusCode).toBe(204);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({ status });
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parking.id } })).toMatchObject({ status: "active" });
    expect(expectedLogs()).toHaveLength(1);
  });

  it.each([
    ["cancelled", warnings],
    ["success", criticals],
  ] as const)("ignores a late %s result for a payment that's no longer pending", async (status, expectedLogs) => {
    const { parking, paymentId } = await startPayment();
    await prisma.payment.update({ where: { id: paymentId }, data: { status: "cancelled" } });

    const response = await postPaymentResult({ paymentId, status });

    expect(response.statusCode).toBe(204);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({ status: "cancelled" });
    expect(await prisma.parking.findUniqueOrThrow({ where: { id: parking.id } })).toMatchObject({ status: "active" });
    expect(expectedLogs()).toHaveLength(1);
  });

  it("responds 404 for an unknown payment", async () => {
    const response = await postPaymentResult({ paymentId: crypto.randomUUID(), status: "success" });

    expect(response.statusCode).toBe(404);
  });

  it.each([{}, { paymentId: "not-a-uuid", status: "success" }, { paymentId: crypto.randomUUID(), status: "pending" }])(
    "rejects an invalid result with a critical log: %j",
    async (body) => {
      const response = await postPaymentResult(body);

      expect(response.statusCode).toBe(400);
      expect(criticals()).toHaveLength(1);
    },
  );

  it("rejects a result without a valid API key", async () => {
    const { paymentId } = await startPayment();

    const response = await postPaymentResult({ paymentId, status: "success" }, "wrong-key");

    expect(response.statusCode).toBe(401);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({ status: "pending" });
  });
});

describe("GET /api/payments/:paymentId", () => {
  it("returns the status of a pending payment", async () => {
    const parking = await parkVehicle();
    const payment = await createPayment(parking.id, "pending");

    expect((await getPaymentStatus(payment.id)).json()).toEqual({ status: "pending" });
  });

  it("cancels a payment that has been pending for longer than the session timeout", async () => {
    const parking = await parkVehicle();
    const payment = await createPayment(parking.id, "pending", new Date(Date.now() - 6 * 60_000));

    expect((await getPaymentStatus(payment.id)).json()).toEqual({ status: "cancelled" });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ status: "cancelled" });
    expect(warnings()).toHaveLength(1);
  });

  it("responds 404 for an unknown payment and 400 for an invalid id", async () => {
    expect((await getPaymentStatus(crypto.randomUUID())).statusCode).toBe(404);
    expect((await getPaymentStatus("not-a-uuid")).statusCode).toBe(400);
  });
});

describe("payment constraints", () => {
  it.each([
    ["pending", "pending"],
    ["pending", "success"],
    ["success", "success"],
  ] as const)("prevents a %s and a %s payment for one parking", async (first, second) => {
    const parking = await parkVehicle();
    await createPayment(parking.id, first);

    await expect(createPayment(parking.id, second)).rejects.toThrow();
  });
});
