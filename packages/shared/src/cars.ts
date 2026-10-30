import { z } from "zod";
import { timezoneOffsetMinutes } from "./config";

export const defaultCarDisplayName = "New car";

function vehicleIdentifierSchema(name: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .toUpperCase()
    .min(1, `Enter the ${name}`)
    .min(min, `Must be ${min} to ${max} characters`)
    .max(max, `Must be ${min} to ${max} characters`)
    .regex(/^[A-Z0-9]*$/, "Use only Latin letters and digits");
}

export const carRegNumberSchema = vehicleIdentifierSchema("registration number", 3, 15);
export const vinSchema = vehicleIdentifierSchema("VIN", 5, 17);
export const certificateNumberSchema = vehicleIdentifierSchema("certificate number", 3, 15);

export const carDisplayNameSchema = z
  .string()
  .trim()
  .overwrite((name) => name.replace(/\s+/g, " "))
  .min(1, "Enter a display name")
  .max(20, "Must be at most 20 characters")
  .regex(/^[A-Za-z0-9 '’-]*$/, "Use only Latin letters, digits, spaces, apostrophes and hyphens");

export const addCarRequestSchema = z.object({
  regNumber: carRegNumberSchema,
  vin: vinSchema,
  certificateNumber: certificateNumberSchema,
  displayName: carDisplayNameSchema.optional(),
});
export type AddCarRequest = z.infer<typeof addCarRequestSchema>;

export const updateCarRequestSchema = z.object({
  displayName: carDisplayNameSchema,
});
export type UpdateCarRequest = z.infer<typeof updateCarRequestSchema>;

export const carSchema = z.object({
  id: z.uuid(),
  regNumber: z.string(),
  displayName: z.string(),
  addedAt: z.iso.datetime({ offset: true }),
});
export type Car = z.infer<typeof carSchema>;

export const carResponseSchema = z.object({ car: carSchema });
export type CarResponse = z.infer<typeof carResponseSchema>;

export const carsResponseSchema = z.object({ cars: z.array(carSchema), nextCursor: z.string().nullable() });
export type CarsResponse = z.infer<typeof carsResponseSchema>;

export const carErrorSchema = z.object({
  error: z.enum([
    "invalid_request",
    "vehicle_mismatch",
    "already_added",
    "car_limit_reached",
    "not_found",
    "unauthorized",
  ]),
});
export type CarError = z.infer<typeof carErrorSchema>["error"];

export function formatLotDate(date: Date | string) {
  const lotTime = new Date(new Date(date).getTime() + timezoneOffsetMinutes * 60_000);
  return lotTime.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
