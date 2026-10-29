import { z } from "zod";
import { timezoneOffsetMinutes } from "./config";

export const bookSpaceRequestSchema = z.object({
  spaceId: z.uuid(),
  carId: z.uuid(),
});
export type BookSpaceRequest = z.infer<typeof bookSpaceRequestSchema>;

export const bookingSchema = z.object({
  parkingId: z.uuid(),
  spaceId: z.uuid(),
  spaceName: z.string(),
  regNumber: z.string(),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type Booking = z.infer<typeof bookingSchema>;

export const bookingResponseSchema = z.object({ booking: bookingSchema });
export type BookingResponse = z.infer<typeof bookingResponseSchema>;

export const bookingErrorSchema = z.object({
  error: z.enum(["invalid_request", "space_unavailable", "car_not_found", "vehicle_busy", "unauthorized"]),
});
export type BookingError = z.infer<typeof bookingErrorSchema>["error"];

const myParkingBaseSchema = z.object({
  parkingId: z.uuid(),
  spaceId: z.uuid(),
  spaceName: z.string(),
  regNumber: z.string(),
  carName: z.string(),
});

export const myParkingSchema = z.discriminatedUnion("status", [
  myParkingBaseSchema.extend({ status: z.literal("booked"), expiresAt: z.iso.datetime({ offset: true }) }),
  myParkingBaseSchema.extend({ status: z.literal("active"), activeSince: z.iso.datetime({ offset: true }) }),
]);
export type MyParking = z.infer<typeof myParkingSchema>;

export const myParkingsResponseSchema = z.object({ parkings: z.array(myParkingSchema) });
export type MyParkingsResponse = z.infer<typeof myParkingsResponseSchema>;

export function formatLotTime(date: Date | string) {
  const lotTime = new Date(new Date(date).getTime() + timezoneOffsetMinutes * 60_000);
  return lotTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
}
