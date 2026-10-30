import { heartbeatEventName, spacesEventName, type Car, type MyParking, type Space } from "@parking/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource, json, mockApi, renderApp, resetApi, testUser } from "./helpers";

const names = ["A1", "A2", "A3", "B1", "B2", "B3"];
const spaceId = (name: string) => `00000000-0000-4000-8000-0000000000${String(names.indexOf(name)).padStart(2, "0")}`;
const spaces = (overrides: Record<string, Space["status"]> = {}): Space[] =>
  names.map((displayName) => ({ id: spaceId(displayName), displayName, status: overrides[displayName] ?? "vacant" }));

const jeep: Car = {
  id: "00000000-0000-4000-8000-000000000c01",
  regNumber: "AA111AA",
  displayName: "My Jeep",
  addedAt: "2026-10-28T10:00:00.000Z",
};
const booking: Extract<MyParking, { status: "booked" }> = {
  parkingId: "00000000-0000-4000-8000-000000000a01",
  spaceId: spaceId("A1"),
  spaceName: "A1",
  regNumber: "AA111AA",
  carName: "My Jeep",
  status: "booked",
  expiresAt: "2026-10-29T06:15:00.000Z",
};

let mine: MyParking[] = [];

async function openTab(path = "/spaces") {
  const created = FakeEventSource.instances.length;
  const view = renderApp(path);
  const tab = within(view.container);
  if (path === "/spaces") {
    await tab.findByRole("button", { name: "A2, available" });
  }
  const own = FakeEventSource.instances.slice(created);
  const source = () => own.filter((s) => !s.closed).at(-1) ?? own.at(-1)!;
  return { ...view, tab, source };
}

function push(source: FakeEventSource, lot: Space[]) {
  act(() => source.emit(spacesEventName, { spaces: lot }));
}

beforeEach(() => {
  resetApi();
  mine = [];
  mockApi({
    "GET /api/spaces": () => json(200, { spaces: spaces() }),
    "GET /api/cars": () => json(200, { cars: [jeep], nextCursor: null }),
    "GET /api/my-parkings": () => json(200, { parkings: mine }),
  });
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function bookA1InTab(tab: Awaited<ReturnType<typeof openTab>>["tab"]) {
  mockApi({
    "POST /api/bookings": () => {
      mine = [booking];
      const { parkingId, spaceName, regNumber, expiresAt } = booking;
      return json(201, { booking: { parkingId, spaceId: spaceId("A1"), spaceName, regNumber, expiresAt } });
    },
  });
  await userEvent.click(tab.getByRole("button", { name: "A1, available" }));
  await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Book this space" }));
  const choice = within(await screen.findByRole("dialog", { name: "Book A1" }));
  await userEvent.click(await choice.findByRole("radio", { name: "My Jeep (AA111AA)" }));
  await userEvent.click(choice.getByRole("button", { name: "Book for AA111AA" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Space booked" })).getByRole("button"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

describe("two tabs", () => {
  it("one user: a booking in one tab is highlighted in both", async () => {
    const first = await openTab();
    const second = await openTab();

    await bookA1InTab(first.tab);
    push(first.source(), spaces({ A1: "booked" }));
    push(second.source(), spaces({ A1: "booked" }));

    expect(await first.tab.findByRole("button", { name: "A1, booked for AA111AA" })).toBeInTheDocument();
    expect(await second.tab.findByRole("button", { name: "A1, booked for AA111AA" })).toBeInTheDocument();
  });

  it("two users: the booking is highlighted for the one who made it and unavailable for the other", async () => {
    const booker = await openTab();
    const other = await openTab();

    await bookA1InTab(booker.tab);
    push(booker.source(), spaces({ A1: "booked" }));
    expect(await booker.tab.findByRole("button", { name: "A1, booked for AA111AA" })).toBeInTheDocument();

    mine = [];
    push(other.source(), spaces({ A1: "booked" }));
    expect(await other.tab.findByRole("img", { name: "A1, unavailable" })).toBeInTheDocument();
  });

  it("two users: a cancelled booking becomes available in both tabs", async () => {
    mine = [booking];
    mockApi({ "GET /api/spaces": () => json(200, { spaces: spaces({ A1: "booked" }) }) });
    const booker = await openTab();
    await booker.tab.findByRole("button", { name: "A1, booked for AA111AA" });
    mine = [];
    const other = await openTab();
    await other.tab.findByRole("img", { name: "A1, unavailable" });
    mine = [booking];
    mockApi({ [`POST /api/bookings/${booking.parkingId}/cancel`]: () => ((mine = []), json(204)) });

    await userEvent.click(booker.tab.getByRole("button", { name: "A1, booked for AA111AA" }));
    const details = within(await screen.findByRole("dialog", { name: "A1" }));
    await userEvent.click(details.getByRole("button", { name: "Cancel booking" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Cancel the booking of A1?" })).getByRole("button", {
        name: "Cancel booking",
      }),
    );
    push(booker.source(), spaces());
    push(other.source(), spaces());
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Booking cancelled" })).getByRole("button"));

    expect(await booker.tab.findByRole("button", { name: "A1, available" })).toBeInTheDocument();
    expect(await other.tab.findByRole("button", { name: "A1, available" })).toBeInTheDocument();
  });

  it("logging out in one tab logs the other one out too and closes its live updates", async () => {
    mockApi({ "POST /api/auth/logout": () => json(204) });
    const profile = await openTab("/profile");
    await profile.tab.findByRole("button", { name: "Log out" });
    const diagram = await openTab();

    mockApi({ "GET /api/auth/me": () => json(401, { error: "unauthorized" }) });
    await userEvent.click(profile.tab.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(diagram.router.state.location.pathname).toBe("/authenticate"));
    expect(FakeEventSource.instances.every((source) => source.closed)).toBe(true);
  });

  it("logging in in one tab logs the other one in too", async () => {
    resetApi(null);
    mockApi({
      "GET /api/spaces": () => json(200, { spaces: spaces() }),
      "POST /api/auth/login": () => json(200, { user: testUser }),
    });
    const first = await openTab("/authenticate");
    const second = await openTab("/authenticate");
    await first.tab.findByRole("form", { name: "Log in" });

    mockApi({ "GET /api/auth/me": () => json(200, { user: testUser }) });
    const login = within(first.tab.getByRole("form", { name: "Log in" }));
    await userEvent.type(login.getByLabelText("Email"), testUser.email);
    await userEvent.type(login.getByLabelText("Password"), "Secret12!");
    await userEvent.click(login.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(first.router.state.location.pathname).toBe("/spaces"));
    await waitFor(() => expect(second.router.state.location.pathname).toBe("/spaces"));
  });

  it("an email change in one tab shows up in the other", async () => {
    const changed = { ...testUser, email: "new@example.com" };
    mockApi({ "PATCH /api/profile/email": () => json(200, { user: changed }) });
    const editing = await openTab("/profile");
    const watching = await openTab("/profile");
    await watching.tab.findByText(testUser.email);

    await userEvent.click(editing.tab.getByRole("button", { name: "Edit email" }));
    const form = within(editing.tab.getByRole("form", { name: "Edit email" }));
    await userEvent.clear(form.getByLabelText("New email"));
    await userEvent.type(form.getByLabelText("New email"), changed.email);
    await userEvent.type(form.getByLabelText("Current password"), "Secret12!");
    mockApi({ "GET /api/auth/me": () => json(200, { user: changed }) });
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    expect(await watching.tab.findByText(changed.email)).toBeInTheDocument();
  });
});

describe("live updates", () => {
  it("shows a notice while the connection is lost and hides it once updates arrive again", async () => {
    const page = await openTab();

    act(() => page.source().fail({ permanently: false }));
    expect(await page.tab.findByText("Live updates paused, reconnecting…")).toBeInTheDocument();
    expect(page.tab.getByRole("alert")).toHaveClass("fixed");

    push(page.source(), spaces({ A2: "occupied" }));
    await waitFor(() => expect(page.tab.queryByText("Live updates paused, reconnecting…")).not.toBeInTheDocument());
    expect(page.tab.getByRole("img", { name: "A2, unavailable" })).toBeInTheDocument();
  });

  it("checks the session and reopens the stream when the browser gives up on it", async () => {
    const page = await openTab();
    const first = page.source();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    act(() => first.fail({ permanently: true }));
    expect(first.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);

    const reopened = FakeEventSource.instances.at(-1)!;
    expect(reopened).not.toBe(first);
    expect(reopened.url).toBe("/api/spaces/events");
    expect(reopened.closed).toBe(false);
  });

  it("treats a stream that goes silent as lost, even when no error arrives (e.g. behind a proxy)", async () => {
    const page = await openTab();
    const first = page.source();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    act(() => first.emit(heartbeatEventName, {}));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(page.tab.queryByText("Live updates paused, reconnecting…")).not.toBeInTheDocument();
    expect(first.closed).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(page.tab.getByText("Live updates paused, reconnecting…")).toBeInTheDocument();
    expect(first.closed).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    const reopened = FakeEventSource.instances.at(-1)!;
    expect(reopened).not.toBe(first);
    act(() => reopened.emit(spacesEventName, { spaces: spaces() }));
    expect(page.tab.queryByText("Live updates paused, reconnecting…")).not.toBeInTheDocument();
  });

  it("keeps the page when the session can't be checked because the server is down", async () => {
    const page = await openTab();

    mockApi({ "GET /api/auth/me": () => json(502) });
    act(() => page.source().fail({ permanently: true }));

    expect(await page.tab.findByText("Live updates paused, reconnecting…")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("An error occurred when checking your session.")).not.toBeInTheDocument());
    expect(page.tab.getByRole("button", { name: "A2, available" })).toBeInTheDocument();
    expect(page.router.state.location.pathname).toBe("/spaces");
  });

  it("sends the user to log in when the stream stopped because the session ran out", async () => {
    const page = await openTab();

    mockApi({ "GET /api/auth/me": () => json(401, { error: "unauthorized" }) });
    act(() => page.source().fail({ permanently: true }));

    await waitFor(() => expect(page.router.state.location.pathname).toBe("/authenticate"));
  });
});
