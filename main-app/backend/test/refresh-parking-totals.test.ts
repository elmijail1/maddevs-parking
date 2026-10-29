import { describe, expect, it } from "vitest";
import { refreshParkingTotals } from "../src/services/parkings";

const local = (iso: string) => new Date(`${iso}+04:00`);

function parkingSince(time: Date, total = 0) {
  return { total, latestTotalUpdate: time, currentRate: "day" as const, latestRateChange: time };
}

describe("refreshParkingTotals", () => {
  it("moves latestTotalUpdate only by the charged full minutes", () => {
    const refreshed = refreshParkingTotals(parkingSince(local("2026-10-28T10:01:30")), local("2026-10-28T10:05:50"));

    expect(refreshed.total).toBe(4 * 20);
    expect(refreshed.latestTotalUpdate).toEqual(local("2026-10-28T10:05:30"));
  });

  it("gives the same total no matter how often it runs", () => {
    const start = parkingSince(local("2026-10-28T10:01:30"));
    const end = local("2026-10-28T10:10:10");

    const once = refreshParkingTotals(start, end);
    const first = refreshParkingTotals(start, local("2026-10-28T10:05:50"));
    const second = refreshParkingTotals({ ...start, ...first }, local("2026-10-28T10:07:05"));
    const third = refreshParkingTotals({ ...start, ...second }, end);

    expect(third.total).toBe(once.total);
    expect(third.latestTotalUpdate).toEqual(once.latestTotalUpdate);
  });

  it("switches the current rate and records the boundary it switched at", () => {
    const parking = parkingSince(local("2026-10-28T19:30:00"), 100);

    const refreshed = refreshParkingTotals(parking, local("2026-10-28T20:30:30"));

    expect(refreshed).toEqual({
      total: 100 + 30 * 20 + 30 * 10,
      latestTotalUpdate: local("2026-10-28T20:30:00"),
      currentRate: "night",
      latestRateChange: local("2026-10-28T20:00:00"),
    });
  });

  it("keeps latestRateChange while the rate stays the same", () => {
    const parking = parkingSince(local("2026-10-28T09:00:00"));

    expect(refreshParkingTotals(parking, local("2026-10-28T11:00:00")).latestRateChange).toEqual(
      local("2026-10-28T09:00:00"),
    );
  });
});
