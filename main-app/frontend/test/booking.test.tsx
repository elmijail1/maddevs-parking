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
    "GET /api/cars": () => json(200, { cars, nextCursor: null }),
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

  it("lists all the user's cars, even more than 10, in a scrollable box", async () => {
    const manyCars = Array.from({ length: 12 }, (_, index) => ({
      ...jeep,
      id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
      regNumber: `CAR${String(index).padStart(2, "0")}`,
      displayName: `Car ${index}`,
    }));
    serve();
    mockApi({
      "GET /api/cars": () => json(200, { cars: manyCars.slice(0, 10), nextCursor: "next" }),
      "GET /api/cars?cursor=next": () => json(200, { cars: manyCars.slice(10), nextCursor: null }),
    });

    const dialog = await openCarChoice();

    expect(await dialog.findByRole("radio", { name: "Car 11 (CAR11)" })).toBeInTheDocument();
    expect(dialog.getAllByRole("radio")).toHaveLength(12);
    expect(dialog.getByRole("radiogroup", { name: "Your cars" })).toHaveClass("max-h-40", "overflow-y-auto");
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

describe("several of the user's spaces at once", () => {
  const vanBooking: MyParking = {
    ...bookedJeep,
    parkingId: "00000000-0000-4000-8000-000000000a02",
    spaceId: spaceId("B2"),
    spaceName: "B2",
    regNumber: "BB222BB",
    carName: "Work van",
    expiresAt: "2026-10-29T06:20:00.000Z",
  };
  const parkedJeep: MyParking = { ...bookedJeep, status: "active", activeSince: "2026-10-29T05:30:00.000Z" };
  const parkedVan: MyParking = { ...vanBooking, status: "active", activeSince: "2026-10-29T04:00:00.000Z" };
  const totalsFor = (parking: MyParking, total: number) => ({
    parking: {
      parkingId: parking.parkingId,
      activeSince: parking.status === "active" ? parking.activeSince : parking.expiresAt,
      chargedMinutes: 30,
      total,
      currentRate: "day",
      ratePerHourCents: 240,
      nextRate: "night",
      nextRateFrom: "2026-10-29T16:00:00.000Z",
    },
  });

  const tile = (name: string) => screen.findByRole("button", { name: new RegExp(`^${name}, `) });

  it("shows each space with its car's name and number, booked ones yellow and parked ones green", async () => {
    serve({ mine: [bookedJeep, parkedVan], lot: spaces({ A1: "booked", B2: "occupied" }) });
    renderApp("/spaces");

    const jeepTile = await tile("A1");
    const vanTile = await tile("B2");

    expect(jeepTile).toHaveAccessibleName("A1, booked for AA111AA");
    expect(within(jeepTile).getByText("My Jeep")).toBeInTheDocument();
    expect(within(jeepTile).getByText("AA111AA")).toBeInTheDocument();
    expect(jeepTile).toHaveClass("animate-pulse", "bg-yellow-300", "border-yellow-500");
    expect(vanTile).toHaveAccessibleName("B2, BB222BB is parked here");
    expect(within(vanTile).getByText("Work van")).toBeInTheDocument();
    expect(within(vanTile).getByText("BB222BB")).toBeInTheDocument();
    expect(vanTile).toHaveClass("animate-pulse", "bg-green-300", "border-green-600");
  });

  it("handles two bookings: each dialog shows its own car, and cancelling one keeps the other", async () => {
    serve({ mine: [bookedJeep, vanBooking], lot: spaces({ A1: "booked", B2: "booked" }) });
    mockApi({
      [`POST /api/bookings/${vanBooking.parkingId}/cancel`]: () => {
        mockApi({ "GET /api/my-parkings": () => json(200, { parkings: [bookedJeep] }) });
        return json(204);
      },
    });
    renderApp("/spaces");

    await userEvent.click(await tile("A1"));
    const jeepDialog = within(await screen.findByRole("dialog", { name: "A1" }));
    expect(jeepDialog.getByText("This space is booked for AA111AA. The booking expires at 10:15.")).toBeInTheDocument();
    await userEvent.click(jeepDialog.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(await tile("B2"));
    const vanDialog = within(await screen.findByRole("dialog", { name: "B2" }));
    expect(vanDialog.getByText("This space is booked for BB222BB. The booking expires at 10:20.")).toBeInTheDocument();
    await userEvent.click(vanDialog.getByRole("button", { name: "Cancel booking" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Cancel the booking of B2?" })).getByRole("button", {
        name: "Cancel booking",
      }),
    );
    pushSpaces(spaces({ A1: "booked" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Booking cancelled" })).getByRole("button"));

    expect(await screen.findByRole("button", { name: "B2, available" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A1, booked for AA111AA" })).toBeInTheDocument();
    expect(requestsTo(`POST /api/bookings/${bookedJeep.parkingId}/cancel`)).toHaveLength(0);
  });

  it("handles two parked cars: each dialog refreshes its own total", async () => {
    serve({ mine: [parkedJeep, parkedVan], lot: spaces({ A1: "occupied", B2: "occupied" }) });
    mockApi({
      [`POST /api/parkings/${parkedJeep.parkingId}/refresh`]: () => json(200, totalsFor(parkedJeep, 120)),
      [`POST /api/parkings/${parkedVan.parkingId}/refresh`]: () => json(200, totalsFor(parkedVan, 480)),
    });
    renderApp("/spaces");

    await userEvent.click(await tile("A1"));
    expect(await screen.findByText("AA111AA has been parked here since 09:30.")).toBeInTheDocument();
    expect(screen.getByText(`Total so far: ${formatCents(120)}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(await tile("B2"));
    expect(await screen.findByText("BB222BB has been parked here since 08:00.")).toBeInTheDocument();
    expect(screen.getByText(`Total so far: ${formatCents(480)}`)).toBeInTheDocument();
    expect(requestsTo(`POST /api/parkings/${parkedJeep.parkingId}/refresh`)).toHaveLength(1);
    expect(requestsTo(`POST /api/parkings/${parkedVan.parkingId}/refresh`)).toHaveLength(1);
  });

  it("handles a booked and a parked car: cancelling for one, the total for the other", async () => {
    serve({ mine: [bookedJeep, parkedVan], lot: spaces({ A1: "booked", B2: "occupied" }) });
    mockApi({ [`POST /api/parkings/${parkedVan.parkingId}/refresh`]: () => json(200, totalsFor(parkedVan, 480)) });
    renderApp("/spaces");

    await userEvent.click(await tile("A1"));
    const booked = within(await screen.findByRole("dialog", { name: "A1" }));
    expect(booked.getByRole("button", { name: "Cancel booking" })).toBeEnabled();
    expect(booked.queryByText(/Total so far/)).not.toBeInTheDocument();
    await userEvent.click(booked.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(await tile("B2"));
    const parked = within(await screen.findByRole("dialog", { name: "B2" }));
    expect(await parked.findByText(`Total so far: ${formatCents(480)}`)).toBeInTheDocument();
    expect(parked.queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
  });

  it("offers only the free cars when booking another space", async () => {
    serve({ mine: [bookedJeep], lot: spaces({ A1: "booked" }) });

    const dialog = await openCarChoice("A2");

    expect(await dialog.findByRole("radio", { name: "Work van (BB222BB)" })).toBeInTheDocument();
    expect(dialog.getAllByRole("radio")).toHaveLength(1);
  });
});
