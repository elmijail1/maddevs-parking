import { describe, expect, it } from "vitest";
import { calculateCharge, formatCents } from "./charges";
import { lastRateBoundaryAtOrBefore, nextRateBoundaryAfter } from "./rates";

const local = (iso: string) => new Date(`${iso}+04:00`);

describe("calculateCharge", () => {
  it.each([
    ["2026-10-28T10:00:00", "2026-10-28T10:00:00"],
    ["2026-10-28T10:00:00", "2026-10-28T10:00:59"],
    ["2026-10-28T10:00:00", "2026-10-28T09:00:00"],
  ])("charges nothing from %s to %s", (from, to) => {
    expect(calculateCharge(local(from), local(to))).toMatchObject({ minutes: 0, totalCents: 0, segments: [] });
  });

  it("charges only full minutes", () => {
    const charge = calculateCharge(local("2026-10-28T10:01:00"), local("2026-10-28T11:00:30"));

    expect(charge).toMatchObject({ minutes: 59, totalCents: 59 * 20, segments: [{ rate: "day", minutes: 59 }] });
    expect(charge.chargedUntil).toEqual(local("2026-10-28T11:00:00"));
  });

  it("splits the charge at the switch to the night rate", () => {
    const charge = calculateCharge(local("2026-10-28T19:30:00"), local("2026-10-28T20:45:40"));

    expect(charge).toMatchObject({
      minutes: 75,
      totalCents: 30 * 20 + 45 * 10,
      segments: [
        { rate: "day", minutes: 30 },
        { rate: "night", minutes: 45 },
      ],
    });
  });

  it("charges each minute at the rate in effect when the minute started", () => {
    const charge = calculateCharge(local("2026-10-28T07:59:30"), local("2026-10-28T08:01:30"));

    expect(charge.segments).toEqual([
      { rate: "night", minutes: 1 },
      { rate: "day", minutes: 1 },
    ]);
    expect(charge.totalCents).toBe(10 + 20);
  });

  it("starts with the new rate when parking starts exactly at a switch", () => {
    expect(calculateCharge(local("2026-10-28T20:00:00"), local("2026-10-28T20:01:00")).segments).toEqual([
      { rate: "night", minutes: 1 },
    ]);
  });

  it("charges multiple days across midnight", () => {
    const charge = calculateCharge(local("2026-10-28T00:00:00"), local("2026-10-30T00:00:00"));

    expect(charge.minutes).toBe(48 * 60);
    expect(charge.totalCents).toBe(2 * (12 * 60 * 20 + 12 * 60 * 10));
    expect(charge.segments.map((s) => s.rate)).toEqual(["night", "day", "night", "day", "night"]);
  });
});

describe("rate boundaries", () => {
  it.each([
    ["2026-10-28T03:00:00", "2026-10-28T08:00:00", "2026-10-27T20:00:00"],
    ["2026-10-28T08:00:00", "2026-10-28T20:00:00", "2026-10-28T08:00:00"],
    ["2026-10-28T12:00:00", "2026-10-28T20:00:00", "2026-10-28T08:00:00"],
    ["2026-10-28T22:00:00", "2026-10-29T08:00:00", "2026-10-28T20:00:00"],
  ])("around %s: next is %s, last is %s", (at, next, last) => {
    expect(nextRateBoundaryAfter(local(at))).toEqual(local(next));
    expect(lastRateBoundaryAtOrBefore(local(at))).toEqual(local(last));
  });
});

describe("formatCents", () => {
  it.each([
    [0, "$0.00"],
    [5, "$0.05"],
    [1180, "$11.80"],
  ])("formats %i as %s", (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });
});
