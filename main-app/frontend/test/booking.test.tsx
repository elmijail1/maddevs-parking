import { formatCents, spacesEventName, type Car, type MyParking, type ParkingTotals, type Space } from "@parking/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource, json, mockApi, renderApp, requestsTo, resetApi } from "./helpers";

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
const van: Car = { ...jeep, id: "00000000-0000-4000-8000-000000000c02", regNumber: "BB222BB", displayName: "Work van" };

const bookedJeep: MyParking = {
  parkingId: "00000000-0000-4000-8000-000000000a01",
  spaceId: spaceId("A1"),
  spaceName: "A1",
  regNumber: "AA111AA",
  carName: "My Jeep",
  status: "booked",
  expiresAt: "2026-10-29T06:15:00.000Z",
};

function serve({ cars = [jeep, van], mine = [] as MyParking[], lot = spaces() } = {}) {
  mockApi({
    "GET /api/spaces": () => json(200, { spaces: lot }),
    "GET /api/cars": () => json(200, { cars }),
    "GET /api/my-parkings": () => json(200, { parkings: mine }),
  });
}

function pushSpaces(lot: Space[]) {
  act(() => FakeEventSource.instances.at(-1)!.emit(spacesEventName, { spaces: lot }));
}

async function openCarChoice(space = "A1") {
  renderApp("/spaces");
  await userEvent.click(await screen.findByRole("button", { name: `${space}, available` }));
  await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Book this space" }));
  return within(await screen.findByRole("dialog", { name: `Book ${space}` }));
}

beforeEach(() => {
  resetApi();
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("choosing a car", () => {
  it("lists the user's cars and has no field to type a number", async () => {
    serve();

    const dialog = await openCarChoice();

    expect(await dialog.findByRole("radio", { name: "My Jeep (AA111AA)" })).not.toBeChecked();
    expect(dialog.getByRole("radio", { name: "Work van (BB222BB)" })).toBeInTheDocument();
    expect(dialog.queryByRole("textbox")).not.toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Book" })).toBeDisabled();
  });

  it("only offers Add new car to a user without cars", async () => {
    serve({ cars: [] });

    const dialog = await openCarChoice();

    expect(await dialog.findByText("You don't have any cars yet.")).toBeInTheDocument();
    expect(dialog.queryAllByRole("radio")).toHaveLength(0);
    expect(dialog.getByRole("button", { name: "Add new car" })).toBeEnabled();
  });

  it("leaves out cars that already have a booking or are in the lot", async () => {
    serve({ mine: [{ ...bookedJeep, spaceId: spaceId("B3"), spaceName: "B3" }] });

    const dialog = await openCarChoice();

    expect(await dialog.findByRole("radio", { name: "Work van (BB222BB)" })).toBeInTheDocument();
    expect(dialog.queryByRole("radio", { name: "My Jeep (AA111AA)" })).not.toBeInTheDocument();
  });

  it("says so when all the user's cars are busy", async () => {
    serve({ cars: [jeep], mine: [{ ...bookedJeep, spaceId: spaceId("B3"), spaceName: "B3" }] });

    const dialog = await openCarChoice();

    expect(await dialog.findByText("All your cars already have a booking or are in the lot.")).toBeInTheDocument();
  });

  it("goes back to the selection with the newly added car selected", async () => {
    const added: Car = { ...jeep, id: "00000000-0000-4000-8000-000000000c03", regNumber: "CC333CC", displayName: "New car" };
    serve({ cars: [] });
    mockApi({ "POST /api/cars": () => json(201, { car: added }) });
    const dialog = await openCarChoice();

    await userEvent.click(await dialog.findByRole("button", { name: "Add new car" }));
    const form = within(screen.getByRole("form", { name: "Add a car" }));
    await userEvent.type(form.getByLabelText(/^Registration number/), "CC333CC");
    await userEvent.type(form.getByLabelText(/^VIN/), "1HGCM82633A004352");
    await userEvent.type(form.getByLabelText(/^Registration certificate number/), "CERT123");
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("form", { name: "Add a car" })).not.toBeInTheDocument());
    const choice = within(screen.getByRole("dialog", { name: "Book A1" }));
    expect(choice.getByRole("radio", { name: "New car (CC333CC)" })).toBeChecked();
    expect(choice.getByRole("button", { name: "Book for CC333CC" })).toBeEnabled();
  });

  it("goes back to the space details", async () => {
    serve();
    const dialog = await openCarChoice("B2");

    await userEvent.click(dialog.getByRole("button", { name: "Back" }));

    expect(await screen.findByRole("dialog", { name: "B2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book this space" })).toBeInTheDocument();
  });
});

describe("booking", () => {
  it("books the space, shows the success message and highlights the space", async () => {
    serve();
    mockApi({
      "POST /api/bookings": () => {
        mockApi({ "GET /api/my-parkings": () => json(200, { parkings: [bookedJeep] }) });
        const { parkingId, spaceName, regNumber, expiresAt } = bookedJeep;
        return json(201, { booking: { parkingId, spaceId: spaceId("A1"), spaceName, regNumber, expiresAt } });
      },
    });
    const dialog = await openCarChoice();

    await userEvent.click(await dialog.findByRole("radio", { name: "My Jeep (AA111AA)" }));
    await userEvent.click(dialog.getByRole("button", { name: "Book for AA111AA" }));

    const success = within(await screen.findByRole("dialog", { name: "Space booked" }));
    expect(
      success.getByText(
        "You've just booked space A1 for AA111AA! Please enter the parking lot within 15 minutes before your booking expires.",
      ),
    ).toBeInTheDocument();
    expect(requestsTo("POST /api/bookings")).toEqual([{ spaceId: spaceId("A1"), carId: jeep.id }]);

    await userEvent.click(success.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const tile = await screen.findByRole("button", { name: "A1, booked for AA111AA" });
    expect(tile).toHaveClass("animate-pulse", "bg-yellow-300");
  });

  it("shows that the space is unavailable when someone was faster", async () => {
    serve();
    mockApi({ "POST /api/bookings": () => json(409, { error: "space_unavailable" }) });
    const dialog = await openCarChoice();

    await userEvent.click(await dialog.findByRole("radio", { name: "My Jeep (AA111AA)" }));
    await userEvent.click(dialog.getByRole("button", { name: "Book for AA111AA" }));
    pushSpaces(spaces({ A1: "booked" }));

    const message = within(await screen.findByRole("dialog", { name: "Space unavailable" }));
    expect(message.getByText("This space is unavailable, please try another.")).toBeInTheDocument();
    await userEvent.click(message.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("img", { name: "A1, unavailable" })).toBeInTheDocument();
  });

  it("shows that the space is unavailable as soon as another car takes it while choosing", async () => {
    serve();
    await openCarChoice();

    pushSpaces(spaces({ A1: "occupied" }));

    expect(await screen.findByRole("dialog", { name: "Space unavailable" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Book A1" })).not.toBeInTheDocument();
  });

  it("explains when the car got a booking elsewhere in the meantime", async () => {
    serve();
    mockApi({ "POST /api/bookings": () => json(409, { error: "vehicle_busy" }) });
    const dialog = await openCarChoice();

    await userEvent.click(await dialog.findByRole("radio", { name: "My Jeep (AA111AA)" }));
    await userEvent.click(dialog.getByRole("button", { name: "Book for AA111AA" }));

    expect(await dialog.findByText("AA111AA already has a booking or is in the lot.")).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Book" })).toBeDisabled();
  });
});

describe("the user's own spaces", () => {
  it("shows the booking's expiration time with a Cancel booking button", async () => {
    serve({ mine: [bookedJeep], lot: spaces({ A1: "booked" }) });
    renderApp("/spaces");

    await userEvent.click(await screen.findByRole("button", { name: "A1, booked for AA111AA" }));

    const dialog = within(await screen.findByRole("dialog", { name: "A1" }));
    expect(dialog.getByText("This space is booked for AA111AA. The booking expires at 10:15.")).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Cancel booking" })).toBeEnabled();
  });

  it("keeps the highlight after leaving the page and coming back", async () => {
    serve({ mine: [bookedJeep], lot: spaces({ A1: "booked" }) });
    renderApp("/spaces");
    await screen.findByRole("button", { name: "A1, booked for AA111AA" });
    const nav = within(screen.getByRole("navigation", { name: "Main" }));

    await userEvent.click(nav.getByRole("link", { name: "My Cars" }));
    await screen.findByRole("heading", { name: "My Cars" });
    await userEvent.click(nav.getByRole("link", { name: "Parking Diagram" }));

    expect(await screen.findByRole("button", { name: "A1, booked for AA111AA" })).toBeInTheDocument();
  });

  it("refreshes the highlights on every live update", async () => {
    serve({ mine: [bookedJeep], lot: spaces({ A1: "booked" }) });
    renderApp("/spaces");
    await screen.findByRole("button", { name: "A1, booked for AA111AA" });

    mockApi({ "GET /api/my-parkings": () => json(200, { parkings: [] }) });
    pushSpaces(spaces());

    expect(await screen.findByRole("button", { name: "A1, available" })).toBeInTheDocument();
  });

  it("closes the booking dialog when the booking is gone", async () => {
    serve({ mine: [bookedJeep], lot: spaces({ A1: "booked" }) });
    renderApp("/spaces");
    await userEvent.click(await screen.findByRole("button", { name: "A1, booked for AA111AA" }));
    await screen.findByRole("dialog", { name: "A1" });

    mockApi({ "GET /api/my-parkings": () => json(200, { parkings: [] }) });
    pushSpaces(spaces());

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows other users' spaces as unavailable", async () => {
    serve({ lot: spaces({ A1: "booked", A2: "occupied" }) });
    renderApp("/spaces");

    expect(await screen.findByRole("img", { name: "A1, unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "A2, unavailable" })).toBeInTheDocument();
  });
});

describe("cancelling a booking", () => {
  const cancelRoute = `POST /api/bookings/${bookedJeep.parkingId}/cancel`;

  async function openConfirmation() {
    serve({ mine: [bookedJeep], lot: spaces({ A1: "booked" }) });
    renderApp("/spaces");
    await userEvent.click(await screen.findByRole("button", { name: "A1, booked for AA111AA" }));
    const details = within(await screen.findByRole("dialog", { name: "A1" }));
    await userEvent.click(details.getByRole("button", { name: "Cancel booking" }));
    return within(await screen.findByRole("dialog", { name: "Cancel the booking of A1?" }));
  }

  it("asks for confirmation, cancels, and the space becomes available again", async () => {
    mockApi({
      [cancelRoute]: () => {
        mockApi({ "GET /api/my-parkings": () => json(200, { parkings: [] }) });
        return json(204);
      },
    });
    const confirmation = await openConfirmation();
    expect(requestsTo(cancelRoute)).toHaveLength(0);

    await userEvent.click(confirmation.getByRole("button", { name: "Cancel booking" }));
    pushSpaces(spaces());

    const message = within(await screen.findByRole("dialog", { name: "Booking cancelled" }));
    expect(message.getByText("Booking cancelled.")).toBeInTheDocument();
    expect(requestsTo(cancelRoute)).toHaveLength(1);
    await userEvent.click(message.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const tile = await screen.findByRole("button", { name: "A1, available" });
    expect(tile).not.toHaveClass("animate-pulse");
  });

  it("keeps the booking when the user changes their mind", async () => {
    const confirmation = await openConfirmation();

    await userEvent.click(confirmation.getByRole("button", { name: "Keep booking" }));

    expect(await screen.findByRole("dialog", { name: "A1" })).toBeInTheDocument();
    expect(requestsTo(cancelRoute)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "A1, booked for AA111AA", hidden: true })).toBeInTheDocument();
  });

  it("explains when the booking can no longer be cancelled", async () => {
    mockApi({ [cancelRoute]: () => json(409, { error: "booking_not_active" }) });
    const confirmation = await openConfirmation();

    await userEvent.click(confirmation.getByRole("button", { name: "Cancel booking" }));

    expect(await screen.findByText("This booking can no longer be cancelled.")).toBeInTheDocument();
  });

  it("switches to that message when the car enters while the confirmation is open", async () => {
    await openConfirmation();

    mockApi({
      "GET /api/my-parkings": () =>
        json(200, { parkings: [{ ...bookedJeep, status: "active", activeSince: "2026-10-29T06:10:00.000Z" }] }),
    });
    pushSpaces(spaces({ A1: "occupied" }));

    expect(await screen.findByText("This booking can no longer be cancelled.")).toBeInTheDocument();
  });

  it("shows an error and keeps the confirmation open when the request fails", async () => {
    mockApi({ [cancelRoute]: () => json(500) });
    const confirmation = await openConfirmation();

    await userEvent.click(confirmation.getByRole("button", { name: "Cancel booking" }));

    expect(await confirmation.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(confirmation.getByRole("button", { name: "Keep booking" })).toBeEnabled();
  });
});

describe("the user's parked car", () => {
  const parked: MyParking = { ...bookedJeep, status: "active", activeSince: "2026-10-29T14:49:00.000Z" };
  const refreshRoute = `POST /api/parkings/${parked.parkingId}/refresh`;
  const totals: ParkingTotals = {
    parkingId: parked.parkingId,
    activeSince: parked.activeSince,
    chargedMinutes: 71,
    total: 1136,
    currentRate: "night",
    ratePerHourCents: 120,
    nextRate: "day",
    nextRateFrom: "2026-10-30T04:00:00.000Z",
  };

  async function openParked() {
    serve({ mine: [parked], lot: spaces({ A1: "occupied" }) });
    renderApp("/spaces");
    await userEvent.click(await screen.findByRole("button", { name: "A1, AA111AA is parked here" }));
    return within(await screen.findByRole("dialog", { name: "A1" }));
  }

  it("recalculates the total on opening and shows the start, the counted time, the total and the rate", async () => {
    mockApi({ [refreshRoute]: () => json(200, { parking: totals }) });

    const dialog = await openParked();

    expect(await dialog.findByText("AA111AA has been parked here since 18:49.")).toBeInTheDocument();
    expect(dialog.getByText("Time counted: 1 hour 11 minutes")).toBeInTheDocument();
    expect(dialog.getByText(`Total so far: ${formatCents(1136)}`)).toBeInTheDocument();
    expect(dialog.getByText("Current rate: night, $1.20 per hour (day rate from 08:00)")).toBeInTheDocument();
    expect(requestsTo(refreshRoute)).toHaveLength(1);
  });

  it("recalculates again each time the dialog is opened", async () => {
    mockApi({ [refreshRoute]: () => json(200, { parking: totals }) });
    const dialog = await openParked();
    await dialog.findByText("Time counted: 1 hour 11 minutes");

    await userEvent.click(dialog.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    mockApi({ [refreshRoute]: () => json(200, { parking: { ...totals, chargedMinutes: 75, total: 1200 } }) });
    await userEvent.click(screen.getByRole("button", { name: "A1, AA111AA is parked here" }));

    expect(await screen.findByText("Time counted: 1 hour 15 minutes")).toBeInTheDocument();
    expect(requestsTo(refreshRoute)).toHaveLength(2);
  });

  it("shows a spinner while calculating", async () => {
    mockApi({ [refreshRoute]: () => new Promise(() => {}) });

    const dialog = await openParked();

    expect(dialog.getByRole("progressbar", { name: "Calculating the total" })).toBeInTheDocument();
  });

  it("says so when the car has left the lot in the meantime", async () => {
    mockApi({ [refreshRoute]: () => json(409, { error: "parking_not_active" }) });

    const dialog = await openParked();

    expect(await dialog.findByText("This car is no longer in the lot.")).toBeInTheDocument();
  });

  it("offers to try again when the calculation fails", async () => {
    mockApi({ [refreshRoute]: () => json(500) });
    const dialog = await openParked();
    await dialog.findByText("The total couldn't be calculated.");

    mockApi({ [refreshRoute]: () => json(200, { parking: totals }) });
    await userEvent.click(dialog.getByRole("button", { name: "Try again" }));

    expect(await dialog.findByText(`Total so far: ${formatCents(1136)}`)).toBeInTheDocument();
  });
});
