import { spacesEventName, type Space, type SpaceStatus } from "@parking/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/routes";

class FakeEventSource {
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

const names = ["A1", "A2", "A3", "B1", "B2", "B3"];
const ids = names.map((_, index) => `00000000-0000-4000-8000-00000000000${index}`);

function spacesWith(status: SpaceStatus, overrides: Record<string, SpaceStatus> = {}): Space[] {
  return names.map((displayName, index) => ({
    id: ids[index]!,
    displayName,
    status: overrides[displayName] ?? status,
  }));
}

const fetchMock = vi.spyOn(globalThis, "fetch");

function respondWithSpaces(spaces: Space[]) {
  fetchMock.mockImplementation(async () => Response.json({ spaces }));
}

function pushSpaces(spaces: Space[]) {
  act(() => FakeEventSource.instances.at(-1)!.emit(spacesEventName, { spaces }));
}

function renderPage(path = "/spaces") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router };
}

const available = (name: string) => screen.findByRole("button", { name: `${name}, available` });
const unavailable = (name: string) => screen.findByRole("img", { name: `${name}, unavailable` });

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parking lot diagram", () => {
  it("shows a spinner while the spaces are loading", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));

    renderPage();

    expect(screen.getByRole("progressbar", { name: "Loading spaces" })).toBeInTheDocument();
  });

  it("shows an error with a button that loads the spaces again", async () => {
    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 500 }));
    renderPage();

    expect(await screen.findByText("An error occurred when loading spaces.")).toBeInTheDocument();

    respondWithSpaces(spacesWith("vacant"));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await available("A1")).toBeInTheDocument();
    expect(screen.queryByText("An error occurred when loading spaces.")).not.toBeInTheDocument();
  });

  it("shows vacant spaces as available and the rest as unavailable, in two rows", async () => {
    respondWithSpaces(spacesWith("vacant", { A2: "occupied", B3: "booked" }));

    renderPage();

    expect(await available("A1")).toBeInTheDocument();
    expect(await unavailable("A2")).toBeInTheDocument();
    expect(await unavailable("B3")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /available$/ })).toHaveLength(4);
    expect(screen.getByText("Driveway")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/spaces");
  });

  it("turns a space unavailable when a car takes it in an empty lot", async () => {
    respondWithSpaces(spacesWith("vacant"));
    renderPage();
    await available("A1");

    pushSpaces(spacesWith("vacant", { A1: "booked" }));

    expect(await unavailable("A1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "A1, available" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /available$/ })).toHaveLength(5);
  });

  it("turns a space available when a car leaves a full lot", async () => {
    respondWithSpaces(spacesWith("occupied"));
    renderPage();
    await unavailable("B2");
    expect(screen.queryAllByRole("button", { name: /available$/ })).toHaveLength(0);

    pushSpaces(spacesWith("occupied", { B2: "vacant" }));

    expect(await available("B2")).toBeInTheDocument();
  });

  it("loads the diagram from the live updates even if the first request failed", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 500 }));
    renderPage();
    await screen.findByText("An error occurred when loading spaces.");

    pushSpaces(spacesWith("vacant"));

    expect(await available("A1")).toBeInTheDocument();
  });

  it("shows the space's rates and leads to the booking dialog", async () => {
    respondWithSpaces(spacesWith("vacant"));
    renderPage();

    await userEvent.click(await available("A3"));

    const details = await screen.findByRole("dialog");
    expect(within(details).getByRole("heading", { name: "A3" })).toBeInTheDocument();
    expect(within(details).getByText("08:00–20:00: $12.00 per hour")).toBeInTheDocument();
    expect(within(details).getByText("20:00–08:00: $6.00 per hour")).toBeInTheDocument();

    await userEvent.click(within(details).getByRole("button", { name: "Book this space" }));

    const booking = await screen.findByRole("dialog", { name: "Book A3" });
    expect(screen.queryByRole("dialog", { name: "A3" })).not.toBeInTheDocument();
    expect(within(booking).getByRole("button", { name: "Book" })).toBeDisabled();

    await userEvent.type(within(booking).getByLabelText("Vehicle registration number"), " aa111aa");

    expect(within(booking).getByRole("button", { name: "Book for AA111AA" })).toBeEnabled();
  });

  it("rejects a registration number that's too long", async () => {
    respondWithSpaces(spacesWith("vacant"));
    renderPage();
    await userEvent.click(await available("A1"));
    await userEvent.click(await screen.findByRole("button", { name: "Book this space" }));

    const booking = await screen.findByRole("dialog", { name: "Book A1" });
    await userEvent.type(within(booking).getByLabelText("Vehicle registration number"), "A".repeat(16));

    expect(within(booking).getByText("Use 1 to 15 characters")).toBeInTheDocument();
    expect(within(booking).getByRole("button", { name: "Book" })).toBeDisabled();
  });

  it("closes the dialog when another car takes the space and doesn't reopen it when the space is freed", async () => {
    respondWithSpaces(spacesWith("vacant"));
    renderPage();
    await userEvent.click(await available("A1"));
    await screen.findByRole("dialog", { name: "A1" });

    pushSpaces(spacesWith("vacant", { A1: "booked" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    pushSpaces(spacesWith("vacant"));
    await available("A1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("redirects / to /spaces", async () => {
    respondWithSpaces(spacesWith("vacant"));

    const { router } = renderPage("/");

    await available("A1");
    expect(router.state.location.pathname).toBe("/spaces");
  });

  it("subscribes to the spaces stream and closes it when the page is left", async () => {
    respondWithSpaces(spacesWith("vacant"));
    const { unmount } = renderPage();
    await available("A1");

    const [source] = FakeEventSource.instances.filter((s) => !s.closed);
    expect(source?.url).toBe("/api/spaces/events");

    unmount();

    expect(FakeEventSource.instances.every((s) => s.closed)).toBe(true);
  });
});
