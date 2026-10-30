import {
  bookingExpiryGapSeconds,
  bookingReminderMinutesBeforeExpiry,
  entranceGraceMinutes,
  formatLotTime,
} from "@parking/shared";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db";
import { sendEmail } from "./email";
import { cancelBookedParking } from "./parkings";
import { cancelJob, jobTime, scheduleJob } from "./scheduler";
import { notifySpacesChanged } from "./spaces";

const reminderKey = (parkingId: string) => `booking-reminder:${parkingId}`;
const expiryKey = (parkingId: string) => `booking-expiry:${parkingId}`;

type BookedParking = { id: string; activeSince: Date };

export function reminderTime(expiresAt: Date) {
  return new Date(expiresAt.getTime() - bookingReminderMinutesBeforeExpiry * 60_000);
}

export function expiryTime(expiresAt: Date) {
  return new Date(expiresAt.getTime() + bookingExpiryGapSeconds * 1000);
}

export function scheduleBookingJobs(parking: BookedParking, log: FastifyBaseLogger, now = new Date()) {
  const remindAt = reminderTime(parking.activeSince);
  if (remindAt > now) {
    scheduleJob(reminderKey(parking.id), remindAt, () => sendBookingReminder(parking.id, log), log);
  }
  scheduleJob(expiryKey(parking.id), expiryTime(parking.activeSince), () => expireBooking(parking.id, log), log);
}

export function bookingJobTimes(parkingId: string) {
  return { reminder: jobTime(reminderKey(parkingId)), expiry: jobTime(expiryKey(parkingId)) };
}

export function cancelBookingJobs(parkingId: string) {
  cancelJob(reminderKey(parkingId));
  cancelJob(expiryKey(parkingId));
}

export function postponeBookingExpiry(parkingId: string, log: FastifyBaseLogger, now = new Date()) {
  const postponed = new Date(now.getTime() + entranceGraceMinutes * 60_000);
  const current = jobTime(expiryKey(parkingId));
  if (!current || postponed > current) {
    scheduleJob(expiryKey(parkingId), postponed, () => expireBooking(parkingId, log), log);
  }
}

export async function scheduleExistingBookings(log: FastifyBaseLogger, now = new Date()) {
  const parkings = await prisma.parking.findMany({ where: { status: "booked" } });
  for (const parking of parkings) {
    scheduleBookingJobs(parking, log, now);
  }
  if (parkings.length > 0) {
    log.info({ bookings: parkings.length }, "Scheduled the reminders and expiries of existing bookings");
  }
}

async function sendBookingReminder(parkingId: string, log: FastifyBaseLogger) {
  const parking = await prisma.parking.findUnique({ where: { id: parkingId }, include: { space: true } });
  if (parking?.status !== "booked") {
    return;
  }
  const users = await prisma.user.findMany({
    where: { vehicles: { some: { vehicleRegNumber: parking.vehicleRegNumber, status: "active" } } },
  });
  const context = { parkingId, regNumber: parking.vehicleRegNumber };
  if (users.length === 0) {
    log.info(context, "Booking reminder has no recipients: nobody has the car on their list");
    return;
  }

  const expiresAt = formatLotTime(parking.activeSince);
  await Promise.all(
    users.map(async (user) => {
      try {
        await sendEmail({
          to: user.email,
          subject: `Your booking of ${parking.space.displayName} expires at ${expiresAt}`,
          text:
            `Your booking for ${parking.vehicleRegNumber} expires at ${expiresAt}. ` +
            "Please enter the parking lot before then.",
        });
        log.info({ ...context, to: user.email }, "Booking reminder sent");
      } catch (error) {
        log.warn({ ...context, to: user.email, err: error }, "Booking reminder couldn't be sent");
      }
    }),
  );
}

async function expireBooking(parkingId: string, log: FastifyBaseLogger) {
  cancelJob(reminderKey(parkingId));
  if ((await cancelBookedParking(parkingId, log)) === "cancelled") {
    log.info({ parkingId }, "Booking expired and was cancelled");
    notifySpacesChanged(log);
  }
}
