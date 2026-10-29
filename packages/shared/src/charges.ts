import { getRatePerMinuteCents, getRateTypeAt, nextRateBoundaryAfter } from "./rates";
import type { RateType } from "./schemas";

const minuteMs = 60_000;

export type ChargeSegment = { rate: RateType; minutes: number };

export function calculateCharge(from: Date, to: Date) {
  const minutes = Math.max(0, Math.floor((to.getTime() - from.getTime()) / minuteMs));
  const segments: ChargeSegment[] = [];
  let cursor = from.getTime();
  let remaining = minutes;

  while (remaining > 0) {
    const minutesStartingBeforeBoundary = Math.ceil(
      (nextRateBoundaryAfter(new Date(cursor)).getTime() - cursor) / minuteMs,
    );
    const segmentMinutes = Math.min(remaining, minutesStartingBeforeBoundary);
    segments.push({ rate: getRateTypeAt(new Date(cursor)), minutes: segmentMinutes });
    cursor += segmentMinutes * minuteMs;
    remaining -= segmentMinutes;
  }

  return {
    minutes,
    totalCents: segments.reduce((sum, s) => sum + s.minutes * getRatePerMinuteCents(s.rate), 0),
    segments,
    chargedUntil: new Date(from.getTime() + minutes * minuteMs),
  };
}

export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
