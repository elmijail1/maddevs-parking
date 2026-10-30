import { z } from "zod";
import { timezoneOffsetMinutes } from "./config";
import { formatLotDate } from "./cars";
import { parkingStatusSchema, rateTypeSchema } from "./schemas";

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
  error: z.enum([
    "invalid_request",
    "space_unavailable",
    "car_not_found",
    "vehicle_busy",
    "not_found",
    "booking_not_active",
    "unauthorized",
  ]),
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

export const parkingTotalsSchema = z.object({
  parkingId: z.uuid(),
  activeSince: z.iso.datetime({ offset: true }),
  chargedMinutes: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  currentRate: rateTypeSchema,
  ratePerHourCents: z.number().int().nonnegative(),
  nextRate: rateTypeSchema,
  nextRateFrom: z.iso.datetime({ offset: true }),
});
export type ParkingTotals = z.infer<typeof parkingTotalsSchema>;

export const parkingTotalsResponseSchema = z.object({ parking: parkingTotalsSchema });

export const parkingErrorSchema = z.object({ error: z.enum(["not_found", "parking_not_active", "unauthorized"]) });

export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;
  if (hours === 0) {
    return plural(minutes, "minute");
  }
  return minutes === 0 ? plural(hours, "hour") : `${plural(hours, "hour")} ${plural(minutes, "minute")}`;
}

export const historyPaymentSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("paid"),
    total: z.number().int().nonnegative(),
    paidAt: z.iso.datetime({ offset: true }),
  }),
  z.object({ status: z.literal("unpaid") }),
]);

export const historyEntrySchema = z.object({
  parkingId: z.uuid(),
  regNumber: z.string(),
  carName: z.string(),
  spaceName: z.string(),
  status: parkingStatusSchema,
  date: z.iso.datetime({ offset: true }),
  payment: historyPaymentSchema.nullable(),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export const historyResponseSchema = z.object({
  parkings: z.array(historyEntrySchema),
  nextCursor: z.string().nullable(),
});
export type HistoryResponse = z.infer<typeof historyResponseSchema>;

export function formatLotDateTime(date: Date | string) {
  return `${formatLotDate(date)}, ${formatLotTime(date)}`;
}
