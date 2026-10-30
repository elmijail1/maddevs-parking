import { describe, expect, it } from "vitest";
import { formatDuration, formatLotTime } from "./bookings";

describe("formatLotTime", () => {
  it("formats the time in 24 hours in the lot's time zone", () => {
    expect(formatLotTime("2026-10-29T06:15:00Z")).toBe("10:15");
    expect(formatLotTime("2026-10-29T20:05:59Z")).toBe("00:05");
    expect(formatLotTime(new Date("2026-10-29T09:00:00Z"))).toBe("13:00");
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0 minutes"],
    [1, "1 minute"],
    [45, "45 minutes"],
    [60, "1 hour"],
    [61, "1 hour 1 minute"],
    [71, "1 hour 11 minutes"],
    [120, "2 hours"],
    [1565, "26 hours 5 minutes"],
  ])("formats %i minutes as %j", (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
