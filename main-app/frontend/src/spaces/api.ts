import {
  bookingResponseSchema,
  heartbeatEventName,
  liveSilenceTimeoutSeconds,
  myParkingsResponseSchema,
  parkingTotalsResponseSchema,
  spacesEventName,
  spacesResponseSchema,
  type Booking,
  type BookSpaceRequest,
  type MyParking,
  type ParkingTotals,
  type Space,
} from "@parking/shared";
import { UnauthorizedError } from "../api-errors";
import { sendRequest } from "../api-request";

export const spacesQueryKey = ["spaces"];
export const spacesEventsUrl = "/api/spaces/events";

export async function fetchSpaces(): Promise<Space[]> {
  const response = await fetch("/api/spaces");
  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error(`Failed to load spaces: ${response.status}`);
  }
  return spacesResponseSchema.parse(await response.json()).spaces;
}

const closedState = 2;
const firstRetryDelayMs = 3000;
const maxRetryDelayMs = 30_000;

export function subscribeToSpaces({
  onSpaces,
  onPausedChange,
  onClosed,
}: {
  onSpaces: (spaces: Space[]) => void;
  onPausedChange: (paused: boolean) => void;
  onClosed: () => void;
}) {
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = firstRetryDelayMs;

  const reconnectLater = (current: EventSource) => {
    clearTimeout(silenceTimer);
    current.close();
    onPausedChange(true);
    onClosed();
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, maxRetryDelayMs);
  };

  const connect = () => {
    const current = new EventSource(spacesEventsUrl);
    source = current;
    const expectMore = () => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => reconnectLater(current), liveSilenceTimeoutSeconds * 1000);
    };
    expectMore();
    current.addEventListener(heartbeatEventName, expectMore);
    current.addEventListener(spacesEventName, (event) => {
      expectMore();
      retryDelay = firstRetryDelayMs;
      onPausedChange(false);
      try {
        onSpaces(spacesResponseSchema.parse(JSON.parse(event.data)).spaces);
      } catch (error) {
        console.error("Received malformed spaces", error);
      }
    });
    current.addEventListener("error", () => {
      onPausedChange(true);
      if (current.readyState === closedState) {
        reconnectLater(current);
      }
    });
  };

  connect();
  return () => {
    clearTimeout(retryTimer);
    clearTimeout(silenceTimer);
    source?.close();
  };
}

export const myParkingsQueryKey = ["myParkings"];

export async function fetchMyParkings(): Promise<MyParking[]> {
  return myParkingsResponseSchema.parse(await sendRequest("GET", "/api/my-parkings")).parkings;
}

export async function bookSpace(body: BookSpaceRequest): Promise<Booking> {
  return bookingResponseSchema.parse(await sendRequest("POST", "/api/bookings", body)).booking;
}

export async function cancelBooking(parkingId: string) {
  await sendRequest("POST", `/api/bookings/${parkingId}/cancel`);
}

export async function refreshParking(parkingId: string): Promise<ParkingTotals> {
  return parkingTotalsResponseSchema.parse(await sendRequest("POST", `/api/parkings/${parkingId}/refresh`)).parking;
}
