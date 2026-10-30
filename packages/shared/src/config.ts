export const rates = {
  baseRatePerMinuteCents: 2,
  multipliers: {
    day: 2,
    night: 1,
  },
} as const;

export const dayHours = {
  startHour: 8,
  endHour: 20,
} as const;

export const timezoneOffsetMinutes = 4 * 60;

export const bookingExpirationMinutes = 15;

export const maxCarsPerUser = 20;

export const bookingReminderMinutesBeforeExpiry = 10;

export const bookingExpiryGapSeconds = 30;

export const entranceGraceMinutes = 2;

export const paymentSessionTimeoutMinutes = 5;

export const paymentResultGraceSeconds = 30;
