import { describe, expect, it } from "vitest";
import { formatLotTime } from "./bookings";

describe("formatLotTime", () => {
  it("formats the time in 24 hours in the lot's time zone", () => {
    expect(formatLotTime("2026-10-29T06:15:00Z")).toBe("10:15");
    expect(formatLotTime("2026-10-29T20:05:59Z")).toBe("00:05");
    expect(formatLotTime(new Date("2026-10-29T09:00:00Z"))).toBe("13:00");
  });
});
