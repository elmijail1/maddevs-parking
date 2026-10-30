import { heartbeatEventName, liveHeartbeatSeconds, spacesEventName, spacesResponseSchema } from "@parking/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { env } from "../src/env";
import { createTestApp, placeVehicle, resetDatabase, signUp } from "./helpers";

const { app } = createTestApp();
let baseUrl: string;
let cookie: string;
const openStreams: AbortController[] = [];

function postDevice(url: string, payload: object) {
  return app.inject({ method: "POST", url, headers: { "x-api-key": env.SERVICE_API_KEY }, payload });
}

async function openSpacesStream() {
  const controller = new AbortController();
  openStreams.push(controller);
  const response = await fetch(`${baseUrl}/api/spaces/events`, { signal: controller.signal, headers: { cookie } });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  async function nextSpaces(timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const end = buffer.indexOf("\n\n");
      if (end >= 0) {
        const message = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const lines = message.split("\n");
        if (lines.includes(`event: ${spacesEventName}`)) {
          const data = lines.find((l) => l.startsWith("data: "))!.slice("data: ".length);
          return spacesResponseSchema.parse(JSON.parse(data)).spaces;
        }
        continue;
      }
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("No spaces event arrived")), Math.max(deadline - Date.now(), 0)),
        ),
      ]);
      if (chunk.done) {
        throw new Error("Stream ended");
      }
      buffer += chunk.value;
    }
  }

  return { response, nextSpaces };
}

function statuses(spaces: { displayName: string; status: string }[]) {
  return Object.fromEntries(spaces.map((s) => [s.displayName, s.status]));
}

beforeAll(async () => {
  baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
});

beforeEach(async () => {
  await resetDatabase();
  cookie = await signUp(app);
});

afterEach(() => {
  openStreams.splice(0).forEach((c) => c.abort());
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("GET /api/spaces", () => {
  it("returns every space sorted by name without the related vehicle", async () => {
    await placeVehicle("A2", "XX000XX", "occupied");
    await placeVehicle("B1", "YY000YY", "booked");

    const response = await app.inject({ method: "GET", url: "/api/spaces", headers: { cookie } });

    expect(response.statusCode).toBe(200);
    const { spaces } = response.json();
    expect(spaces.map((s: { displayName: string }) => s.displayName)).toEqual(["A1", "A2", "A3", "B1", "B2", "B3"]);
    expect(statuses(spaces)).toMatchObject({ A1: "vacant", A2: "occupied", B1: "booked" });
    expect(Object.keys(spaces[0]).sort()).toEqual(["displayName", "id", "status"]);
    expect(response.body).not.toContain("XX000XX");
  });
});

describe("authentication", () => {
  it.each([
    ["no token", {}],
    ["a forged token", { cookie: "token=not-a-jwt" }],
    ["the device API key", { "x-api-key": env.SERVICE_API_KEY }],
  ])("rejects the spaces and the stream with %s", async (_, headers) => {
    for (const url of ["/api/spaces", "/api/spaces/events"]) {
      const response = await app.inject({ method: "GET", url, headers });
      expect(response.statusCode).toBe(401);
    }
  });
});

describe("GET /api/spaces/events", () => {
  it("sends the current spaces as soon as a client connects", async () => {
    await placeVehicle("A1", "XX000XX", "occupied");

    const { response, nextSpaces } = await openSpacesStream();

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(statuses(await nextSpaces())).toMatchObject({ A1: "occupied", A2: "vacant" });
  });

  it("sends the spaces again after a car enters and after it leaves", async () => {
    const { nextSpaces } = await openSpacesStream();
    await nextSpaces();

    await postDevice("/api/new-entrance", { regNumber: "XX000XX" });
    expect(statuses(await nextSpaces())).toMatchObject({ A1: "booked" });

    await postDevice("/api/new-parking", { regNumber: "XX000XX", time: new Date().toISOString() });
    expect(statuses(await nextSpaces())).toMatchObject({ A1: "occupied" });

    await prisma.parking.updateMany({ data: { status: "finished" } });
    await postDevice("/api/space-vacant-again", { regNumber: "XX000XX" });
    expect(statuses(await nextSpaces())).toMatchObject({ A1: "vacant" });
  });

  it("sends the spaces again after a user books one and cancels the booking", async () => {
    const { nextSpaces } = await openSpacesStream();
    await nextSpaces();
    const car = await app.inject({
      method: "POST",
      url: "/api/cars",
      headers: { cookie },
      payload: { regNumber: "XX000XX", vin: "VIN12345", certificateNumber: "CERT1" },
    });
    const spaceId = (await prisma.space.findUniqueOrThrow({ where: { displayName: "B1" } })).id;

    await app.inject({
      method: "POST",
      url: "/api/bookings",
      headers: { cookie },
      payload: { spaceId, carId: car.json().car.id },
    });

    expect(statuses(await nextSpaces())).toMatchObject({ B1: "booked" });

    const parkingId = (await prisma.parking.findFirstOrThrow()).id;
    await app.inject({ method: "POST", url: `/api/bookings/${parkingId}/cancel`, headers: { cookie } });

    expect(statuses(await nextSpaces())).toMatchObject({ B1: "vacant" });
  });

  it("sends every change to every connected client", async () => {
    const first = await openSpacesStream();
    const second = await openSpacesStream();
    await first.nextSpaces();
    await second.nextSpaces();

    await postDevice("/api/new-entrance", { regNumber: "XX000XX" });

    expect(statuses(await first.nextSpaces())).toMatchObject({ A1: "booked" });
    expect(statuses(await second.nextSpaces())).toMatchObject({ A1: "booked" });
  });

  it("sends a heartbeat event every few seconds", { timeout: 10_000 }, async () => {
    const controller = new AbortController();
    openStreams.push(controller);
    const response = await fetch(`${baseUrl}/api/spaces/events`, { signal: controller.signal, headers: { cookie } });
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let received = "";
    const startedAt = Date.now();

    while (!received.includes(`event: ${heartbeatEventName}\n`)) {
      received += (await reader.read()).value;
    }

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(liveHeartbeatSeconds * 1000 - 200);
  });

  it("doesn't send anything when a request changes no space", async () => {
    await placeVehicle("A1", "XX000XX", "occupied");
    const { nextSpaces } = await openSpacesStream();
    await nextSpaces();

    await postDevice("/api/new-entrance", { regNumber: "XX000XX" });

    await expect(nextSpaces(500)).rejects.toThrow("No spaces event arrived");
  });
});
