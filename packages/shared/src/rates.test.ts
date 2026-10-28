import { describe, expect, it } from "vitest";
import { getRateTypeAt } from "./rates";

describe("getRateTypeAt", () => {
  it.each([
    ["2026-10-28T03:59:59Z", "night"],
    ["2026-10-28T04:00:00Z", "day"],
    ["2026-10-28T15:59:59Z", "day"],
    ["2026-10-28T16:00:00Z", "night"],
    ["2026-10-28T23:00:00Z", "night"],
  ])("returns the rate in UTC+4 for %s", (iso, expected) => {
    expect(getRateTypeAt(new Date(iso))).toBe(expected);
  });
});
