import { z } from "zod";

export const spaceStatusSchema = z.enum(["vacant", "booked", "occupied"]);
export type SpaceStatus = z.infer<typeof spaceStatusSchema>;

export const parkingStatusSchema = z.enum(["booked", "cancelled", "active", "finished"]);
export type ParkingStatus = z.infer<typeof parkingStatusSchema>;

export const rateTypeSchema = z.enum(["day", "night"]);
export type RateType = z.infer<typeof rateTypeSchema>;

export const regNumberSchema = z.string().trim().toUpperCase().min(1).max(15);

export const directionSchema = z.enum(["in", "out"]);
export type Direction = z.infer<typeof directionSchema>;

export const newEntranceRequestSchema = z.object({
  regNumber: regNumberSchema,
});
export type NewEntranceRequest = z.infer<typeof newEntranceRequestSchema>;

export const newEntranceResponseSchema = z.discriminatedUnion("allowed", [
  z.object({ allowed: z.literal(true) }),
  z.object({ allowed: z.literal(false), reason: z.enum(["no_available_spaces", "vehicle_already_inside"]) }),
]);
export type NewEntranceResponse = z.infer<typeof newEntranceResponseSchema>;

export const newParkingRequestSchema = z.object({
  regNumber: regNumberSchema,
  time: z.iso.datetime({ offset: true }),
});
export type NewParkingRequest = z.infer<typeof newParkingRequestSchema>;
