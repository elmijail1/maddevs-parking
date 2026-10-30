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

export const paymentStatusSchema = z.enum(["pending", "cancelled", "failed", "success"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentResultStatusSchema = paymentStatusSchema.exclude(["pending"]);
export type PaymentResultStatus = z.infer<typeof paymentResultStatusSchema>;

export const newExitRequestSchema = z.object({
  regNumber: regNumberSchema,
});
export type NewExitRequest = z.infer<typeof newExitRequestSchema>;

export const newExitResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("awaiting_payment"), paymentId: z.uuid(), total: z.number().int() }),
  z.object({ status: z.literal("denied"), reason: z.enum(["no_active_parking", "terminal_unavailable"]) }),
]);
export type NewExitResponse = z.infer<typeof newExitResponseSchema>;

export const spaceVacantAgainRequestSchema = z.object({
  regNumber: regNumberSchema,
});
export type SpaceVacantAgainRequest = z.infer<typeof spaceVacantAgainRequestSchema>;

export const spaceSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  status: spaceStatusSchema,
});
export type Space = z.infer<typeof spaceSchema>;

export const spacesResponseSchema = z.object({
  spaces: z.array(spaceSchema),
});
export type SpacesResponse = z.infer<typeof spacesResponseSchema>;

export const spacesEventName = "spaces";

export const heartbeatEventName = "heartbeat";

export const paymentSessionRequestSchema = z.object({
  paymentId: z.uuid(),
  total: z.number().int().nonnegative(),
});
export type PaymentSessionRequest = z.infer<typeof paymentSessionRequestSchema>;

export const paymentResultRequestSchema = z.object({
  paymentId: z.uuid(),
  status: paymentResultStatusSchema,
});
export type PaymentResultRequest = z.infer<typeof paymentResultRequestSchema>;

export const paymentStatusResponseSchema = z.object({
  status: paymentStatusSchema,
});
export type PaymentStatusResponse = z.infer<typeof paymentStatusResponseSchema>;

export const sendEmailRequestSchema = z.object({
  to: z.email(),
  subject: z.string().min(1),
  text: z.string().min(1),
});
export type SendEmailRequest = z.infer<typeof sendEmailRequestSchema>;
