import type { SpacesResponse } from "@parking/shared";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db";

type SpacesListener = (data: string) => void;

const listeners = new Map<SpacesListener, string | null>();
let broadcasting = false;
let changedWhileBroadcasting = false;

export async function listSpaces(): Promise<SpacesResponse> {
  const spaces = await prisma.space.findMany({
    select: { id: true, displayName: true, status: true },
    orderBy: { displayName: "asc" },
  });
  return { spaces };
}

export function subscribeToSpaces(listener: SpacesListener, log: FastifyBaseLogger) {
  listeners.set(listener, null);
  notifySpacesChanged(log);
  return () => void listeners.delete(listener);
}

export function notifySpacesChanged(log: FastifyBaseLogger) {
  if (listeners.size === 0) {
    return;
  }
  if (broadcasting) {
    changedWhileBroadcasting = true;
    return;
  }
  broadcasting = true;
  void broadcast()
    .catch((error) => log.error({ err: error }, "Failed to broadcast the spaces"))
    .finally(() => {
      broadcasting = false;
    });
}

async function broadcast() {
  do {
    changedWhileBroadcasting = false;
    const data = JSON.stringify(await listSpaces());
    for (const [listener, lastSent] of listeners) {
      if (lastSent !== data) {
        listeners.set(listener, data);
        listener(data);
      }
    }
  } while (changedWhileBroadcasting);
}
