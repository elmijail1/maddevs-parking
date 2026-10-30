import {
  bookingResponseSchema,
  myParkingsResponseSchema,
  spacesEventName,
  spacesResponseSchema,
  type Booking,
  type BookSpaceRequest,
  type MyParking,
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

export function subscribeToSpaces(onSpaces: (spaces: Space[]) => void) {
  const source = new EventSource(spacesEventsUrl);
  source.addEventListener(spacesEventName, (event) => {
    try {
      onSpaces(spacesResponseSchema.parse(JSON.parse(event.data)).spaces);
    } catch (error) {
      console.error("Received malformed spaces", error);
    }
  });
  return () => source.close();
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
