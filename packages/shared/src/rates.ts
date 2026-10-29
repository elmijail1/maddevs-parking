import { dayHours, rates, timezoneOffsetMinutes } from "./config";
import type { RateType } from "./schemas";

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const offsetMs = timezoneOffsetMinutes * minuteMs;

export function getRateTypeAt(date: Date): RateType {
  const localHour = new Date(date.getTime() + offsetMs).getUTCHours();
  return localHour >= dayHours.startHour && localHour < dayHours.endHour ? "day" : "night";
}

export function getRatePerMinuteCents(rate: RateType) {
  return rates.baseRatePerMinuteCents * rates.multipliers[rate];
}

function rateBoundariesAround(date: Date) {
  const localDayStart = Math.floor((date.getTime() + offsetMs) / dayMs) * dayMs;
  return [dayHours.endHour - 24, dayHours.startHour, dayHours.endHour, dayHours.startHour + 24].map(
    (hour) => localDayStart + hour * hourMs - offsetMs,
  );
}

export function nextRateBoundaryAfter(date: Date) {
  return new Date(rateBoundariesAround(date).find((boundary) => boundary > date.getTime())!);
}

export function lastRateBoundaryAtOrBefore(date: Date) {
  return new Date(rateBoundariesAround(date).findLast((boundary) => boundary <= date.getTime())!);
}
