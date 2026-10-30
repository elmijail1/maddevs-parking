import { formatCents, getRatePerMinuteCents, spacesEventName, type Space, type SpaceStatus } from "@parking/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource, fetchMock, json, mockApi, renderApp, resetApi } from "./helpers";

const names = ["A1", "A2", "A3", "B1", "B2", "B3"];
const ids = names.map((_, index) => `00000000-0000-4000-8000-00000000000${index}`);

function spacesWith(status: SpaceStatus, overrides: Record<string, SpaceStatus> = {}): Space[] {
  return names.map((displayName, index) => ({
    id: ids[index]!,
    displayName,
    status: overrides[displayName] ?? status,
  }));
}

function respondWithSpaces(spaces: Space[]) {
  mockApi({ "GET /api/spaces": () => json(200, { spaces }) });
}

function failSpaces(status = 500) {
  mockApi({ "GET /api/spaces": () => json(status) });
}

function pushSpaces(spaces: Space[]) {
  act(() => FakeEventSource.instances.at(-1)!.emit(spacesEventName, { spaces }));
}

const renderPage = (path = "/spaces") => renderApp(path);

const available = (name: string) => screen.findByRole("button", { name: `${name}, available` });
const unavailable = (name: string) => screen.findByRole("img", { name: `${name}, unavailable` });

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  resetApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parking lot diagram", () => {
  it("shows a spinner while the spaces are loading", async () => {
    mockApi({ "GET /api/spaces": () => new Promise(() => {}) });

    renderPage();

    expect(await screen.findByRole("progressbar", { name: "Loading spaces" })).toBeInTheDocument();
  });

  it("shows an error with a button that loads the spaces again", async () => {
    failSpaces();
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
    failSpaces();
    renderPage();
    await screen.findByText("An error occurred when loading spaces.");

    pushSpaces(spacesWith("vacant"));

    expect(await available("A1")).toBeInTheDocument();
  });

  it("shows the space's rates with Close and Book this space buttons", async () => {
    respondWithSpaces(spacesWith("vacant"));
    mockApi({ "GET /api/cars": () => json(200, { cars: [] }) });
    renderPage();

    await userEvent.click(await available("A3"));

    const details = await screen.findByRole("dialog");
    expect(within(details).getByRole("heading", { name: "A3" })).toBeInTheDocument();
    const hourly = (rate: "day" | "night") => `${formatCents(getRatePerMinuteCents(rate) * 60)} per hour`;
    expect(within(details).getByText(`08:00–20:00: ${hourly("day")}`)).toBeInTheDocument();
    expect(within(details).getByText(`20:00–08:00: ${hourly("night")}`)).toBeInTheDocument();

    await userEvent.click(within(details).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(await available("A3"));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Book this space" }));

    expect(await screen.findByRole("dialog", { name: "Book A3" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "A3" })).not.toBeInTheDocument();
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

  it("sends the user to log in again when the session runs out", async () => {
    failSpaces(401);

    const { router } = renderPage();

    expect(await screen.findByRole("tab", { name: "Log in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/authenticate");
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
