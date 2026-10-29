import { describe, expect, it } from "vitest";
import { addCarRequestSchema, carDisplayNameSchema, carRegNumberSchema, formatLotDate, vinSchema } from "./cars";

const firstError = (result: { error?: { issues: { message: string }[] } }) => result.error?.issues[0]?.message;

describe("vehicle identifiers", () => {
  it("trims and uppercases them", () => {
    expect(carRegNumberSchema.parse(" aa111aa ")).toBe("AA111AA");
  });

  it.each([
    ["", "Enter the registration number"],
    ["AB", "Must be 3 to 15 characters"],
    ["A".repeat(16), "Must be 3 to 15 characters"],
    ["AA 111", "Use only Latin letters and digits"],
    ["AA-111", "Use only Latin letters and digits"],
    ["ЖЖ111", "Use only Latin letters and digits"],
  ])("rejects the registration number %j", (value, message) => {
    expect(firstError(carRegNumberSchema.safeParse(value))).toBe(message);
  });

  it("allows VINs of 5 to 17 characters", () => {
    expect(vinSchema.safeParse("1HGCM").success).toBe(true);
    expect(vinSchema.safeParse("1HGCM82633A004352").success).toBe(true);
    expect(firstError(vinSchema.safeParse("1HGC"))).toBe("Must be 5 to 17 characters");
    expect(firstError(vinSchema.safeParse("1HGCM82633A0043521"))).toBe("Must be 5 to 17 characters");
  });
});

describe("carDisplayNameSchema", () => {
  it.each([
    ["  My   Jeep ", "My Jeep"],
    ["MY BRO'S JEEP", "MY BRO'S JEEP"],
    ["Mum’s car", "Mum’s car"],
    ["Rav-4", "Rav-4"],
    ["x".repeat(20), "x".repeat(20)],
  ])("accepts %j", (value, parsed) => {
    expect(carDisplayNameSchema.parse(value)).toBe(parsed);
  });

  it.each([
    ["   ", "Enter a display name"],
    ["x".repeat(21), "Must be at most 20 characters"],
    ["Jeep!", "Use only Latin letters, digits, spaces, apostrophes and hyphens"],
    ["Машина", "Use only Latin letters, digits, spaces, apostrophes and hyphens"],
  ])("rejects %j", (value, message) => {
    expect(firstError(carDisplayNameSchema.safeParse(value))).toBe(message);
  });
});

describe("addCarRequestSchema", () => {
  it("makes the display name optional", () => {
    expect(addCarRequestSchema.parse({ regNumber: "aa111aa", vin: "vin12", certificateNumber: "cert1" })).toEqual({
      regNumber: "AA111AA",
      vin: "VIN12",
      certificateNumber: "CERT1",
    });
  });
});

describe("formatLotDate", () => {
  it("formats the date in the lot's time zone", () => {
    expect(formatLotDate("2026-10-29T12:00:00Z")).toBe("29 Oct 2026");
    expect(formatLotDate("2026-10-29T20:30:00Z")).toBe("30 Oct 2026");
  });
});
