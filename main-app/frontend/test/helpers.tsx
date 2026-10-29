import type { AuthUser } from "@parking/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { createQueryClient } from "../src/query-client";
import { routes } from "../src/routes";

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

export const testUser: AuthUser = { id: "00000000-0000-4000-8000-0000000000aa", email: "driver@example.com" };

export const fetchMock = vi.spyOn(globalThis, "fetch");

type Handler = (body: unknown) => Response | Promise<Response>;
const handlers = new Map<string, Handler>();

export const json = (status: number, body?: unknown) =>
  body === undefined ? new Response(null, { status }) : Response.json(body, { status });

export function mockApi(routes: Record<string, Handler>) {
  for (const [route, handler] of Object.entries(routes)) {
    handlers.set(route, handler);
  }
}

export function resetApi(user: AuthUser | null = testUser) {
  handlers.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const route = `${init?.method ?? "GET"} ${String(input)}`;
    const handler = handlers.get(route);
    if (!handler) {
      throw new Error(`Unexpected request: ${route}`);
    }
    return handler(init?.body ? JSON.parse(String(init.body)) : undefined);
  });
  mockApi({
    "GET /api/auth/me": () => (user ? json(200, { user }) : json(401, { error: "unauthorized" })),
    "GET /api/my-parkings": () => json(200, { parkings: [] }),
  });
}

export const requestsTo = (route: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => `${init?.method ?? "GET"} ${String(input)}` === route)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));

export function renderApp(path: string) {
  const queryClient = createQueryClient({ queries: { retry: false } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}
