import { spacesEventName, spacesResponseSchema, type Space } from "@parking/shared";
import { UnauthorizedError } from "../api-errors";

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
