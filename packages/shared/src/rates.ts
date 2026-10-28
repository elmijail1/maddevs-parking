import { dayHours, timezoneOffsetMinutes } from "./config";
import type { RateType } from "./schemas";

export function getRateTypeAt(date: Date): RateType {
  const localHour = new Date(date.getTime() + timezoneOffsetMinutes * 60_000).getUTCHours();
  return localHour >= dayHours.startHour && localHour < dayHours.endHour ? "day" : "night";
}
