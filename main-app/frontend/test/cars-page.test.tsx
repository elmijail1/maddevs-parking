import type { Car } from "@parking/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource, json, mockApi, renderApp, requestsTo, resetApi } from "./helpers";

const jeep: Car = {
  id: "00000000-0000-4000-8000-000000000c01",
  regNumber: "AA111AA",
  displayName: "My Jeep",
  addedAt: "2026-10-28T10:00:00.000Z",
};
const van: Car = {
  id: "00000000-0000-4000-8000-000000000c02",
  regNumber: "BB222BB",
  displayName: "Work van",
  addedAt: "2026-10-20T10:00:00.000Z",
};
const newCar = { regNumber: "CC333CC", vin: "1HGCM82633A004352", certificateNumber: "CERT123" };

function serveCars(cars: Car[]) {
  mockApi({ "GET /api/cars": () => json(200, { cars }) });
}

async function openCars(cars: Car[] = [jeep, van]) {
  serveCars(cars);
  const view = renderApp("/cars");
  await screen.findByRole("heading", { name: "My Cars" });
  if (cars.length > 0) {
    await screen.findByRole("list", { name: "Your cars" });
  }
  return view;
}

const card = (regNumber: string) => within(screen.getByRole("listitem", { name: regNumber }));
const cardNames = () =>
  screen.queryAllByRole("listitem", { hidden: true }).map((item) => item.getAttribute("aria-label"));
const addForm = () => within(screen.getByRole("form", { name: "Add a car" }));

async function openAddDialog() {
  await userEvent.click(screen.getByRole("button", { name: "Add car" }));
  return addForm();
}

async function fillAddForm(values: Partial<Record<"reg" | "vin" | "cert" | "name", string>>) {
  const labels = { reg: /^Registration number/, vin: /^VIN/, cert: /^Registration certificate number/, name: /^Display name/ };
  for (const [key, value] of Object.entries(values)) {
    await userEvent.type(addForm().getByLabelText(labels[key as keyof typeof labels]), value);
  }
}

beforeEach(() => {
  resetApi();
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cars page", () => {
  it("redirects to /authenticate when the user isn't logged in", async () => {
    resetApi(null);

    const { router } = renderApp("/cars");

    await screen.findByRole("tab", { name: "Log in" });
    expect(router.state.location.pathname).toBe("/authenticate");
  });

  it("only shows the Add car button when there are no cars", async () => {
    await openCars([]);

    expect(await screen.findByRole("list", { name: "Your cars" })).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Add car" })).toBeEnabled();
  });

  it("shows a card per car with its name, number and date added, in the server's order", async () => {
    await openCars();

    expect(cardNames()).toEqual(["AA111AA", "BB222BB"]);
    expect(card("AA111AA").getByRole("heading", { name: "My Jeep" })).toBeInTheDocument();
    expect(card("AA111AA").getByText("Added 28 Oct 2026")).toBeInTheDocument();
    expect(card("BB222BB").getByRole("button", { name: "Edit BB222BB" })).toBeInTheDocument();
    expect(card("BB222BB").getByRole("button", { name: "Delete BB222BB" })).toBeInTheDocument();
  });

  it("is linked from the header", async () => {
    serveCars([]);
    mockApi({ "GET /api/spaces": () => json(200, { spaces: [] }) });
    const { router } = renderApp("/spaces");

    await userEvent.click(await screen.findByRole("link", { name: "My Cars" }));

    expect(router.state.location.pathname).toBe("/cars");
  });

  it("shows an error with a retry button when the cars can't be loaded", async () => {
    mockApi({ "GET /api/cars": () => json(500) });
    renderApp("/cars");

    expect(await screen.findByText("An error occurred when loading your cars.")).toBeInTheDocument();
    serveCars([jeep]);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("listitem", { name: "AA111AA" })).toBeInTheDocument();
  });
});

describe("adding a car", () => {
  it("sends the normalized values and puts the new car first", async () => {
    const added: Car = { ...jeep, id: "00000000-0000-4000-8000-000000000c03", regNumber: "CC333CC", displayName: "Mum's car" };
    mockApi({ "POST /api/cars": () => json(201, { car: added }) });
    await openCars();

    await openAddDialog();
    await fillAddForm({ reg: " cc333cc", vin: newCar.vin.toLowerCase(), cert: "cert123", name: "Mum's  car" });
    await userEvent.click(addForm().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("form", { name: "Add a car" })).not.toBeInTheDocument());
    expect(requestsTo("POST /api/cars")).toEqual([{ ...newCar, displayName: "Mum's car" }]);
    expect(cardNames()).toEqual(["CC333CC", "AA111AA", "BB222BB"]);
  });

  it("leaves out an empty display name so the server uses the default", async () => {
    const added: Car = { ...jeep, id: "00000000-0000-4000-8000-000000000c04", regNumber: "CC333CC", displayName: "New car" };
    mockApi({ "POST /api/cars": () => json(201, { car: added }) });
    await openCars([]);

    await openAddDialog();
    expect(addForm().getByText(`Optional. If empty, it's "New car".`)).toBeInTheDocument();
    await fillAddForm({ reg: newCar.regNumber, vin: newCar.vin, cert: newCar.certificateNumber, name: "   " });
    await userEvent.click(addForm().getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "New car" })).toBeInTheDocument();
    expect(requestsTo("POST /api/cars")).toEqual([newCar]);
  });

  it.each([
    [{}, { reg: "Enter the registration number", vin: "Enter the VIN", cert: "Enter the certificate number" }],
    [
      { reg: "AB", vin: "1HGC", cert: "C".repeat(16) },
      { reg: "Must be 3 to 15 characters", vin: "Must be 5 to 17 characters", cert: "Must be 3 to 15 characters" },
    ],
    [
      { reg: "AA-111", vin: "ЖHGCM", cert: "CERT 1" },
      {
        reg: "Use only Latin letters and digits",
        vin: "Use only Latin letters and digits",
        cert: "Use only Latin letters and digits",
      },
    ],
    [
      { reg: newCar.regNumber, vin: newCar.vin, cert: newCar.certificateNumber, name: "Jeep #1" },
      { name: "Use only Latin letters, digits, spaces, apostrophes and hyphens" },
    ],
    [
      { reg: newCar.regNumber, vin: newCar.vin, cert: newCar.certificateNumber, name: "x".repeat(21) },
      { name: "Must be at most 20 characters" },
    ],
  ])("doesn't send invalid values: %j", async (values, messages) => {
    await openCars([]);

    await openAddDialog();
    await fillAddForm(values);
    await userEvent.click(addForm().getByRole("button", { name: "Save" }));

    const labels = { reg: /^Registration number/, vin: /^VIN/, cert: /^Registration certificate number/, name: /^Display name/ };
    for (const [key, message] of Object.entries(messages)) {
      expect(addForm().getByLabelText(labels[key as keyof typeof labels])).toHaveAccessibleDescription(message);
    }
    expect(requestsTo("POST /api/cars")).toHaveLength(0);
  });

  it.each([
    ["vehicle_mismatch", "The VIN or certificate number doesn't match this car."],
    ["already_added", "This car is already in your list."],
  ])("shows the server's %s error and keeps the dialog open", async (error, message) => {
    mockApi({ "POST /api/cars": () => json(409, { error }) });
    await openCars();

    await openAddDialog();
    await fillAddForm({ reg: newCar.regNumber, vin: newCar.vin, cert: newCar.certificateNumber });
    await userEvent.click(addForm().getByRole("button", { name: "Save" }));

    expect(await addForm().findByText(message)).toBeInTheDocument();
    expect(cardNames()).toEqual(["AA111AA", "BB222BB"]);
  });

  it.each([
    ["Cancel", () => userEvent.click(addForm().getByRole("button", { name: "Cancel" }))],
    ["the cross", () => userEvent.click(addForm().getByRole("button", { name: "Close" }))],
    [
      "a click outside",
      () => userEvent.click(screen.getByRole("dialog").closest(".MuiDialog-root")!.querySelector(".MuiBackdrop-root")!),
    ],
    ["Escape", () => userEvent.keyboard("{Escape}")],
  ])("closes the dialog and discards the progress with %s", async (_, close) => {
    await openCars();
    await openAddDialog();
    await fillAddForm({ reg: newCar.regNumber });

    await close();
    await waitFor(() => expect(screen.queryByRole("form", { name: "Add a car" })).not.toBeInTheDocument());
    await openAddDialog();

    expect(addForm().getByLabelText(/^Registration number/)).toHaveValue("");
    expect(requestsTo("POST /api/cars")).toHaveLength(0);
  });
});

describe("editing a display name", () => {
  it("saves the new name", async () => {
    mockApi({
      "PATCH /api/cars/00000000-0000-4000-8000-000000000c01": () => json(200, { car: { ...jeep, displayName: "Old Jeep" } }),
    });
    await openCars();

    await userEvent.click(card("AA111AA").getByRole("button", { name: "Edit AA111AA" }));
    const name = card("AA111AA").getByLabelText("Display name");
    expect(name).toHaveValue("My Jeep");
    await userEvent.clear(name);
    await userEvent.type(name, " Old   Jeep");
    await userEvent.click(card("AA111AA").getByRole("button", { name: "Save" }));

    expect(await card("AA111AA").findByRole("heading", { name: "Old Jeep" })).toBeInTheDocument();
    expect(requestsTo("PATCH /api/cars/00000000-0000-4000-8000-000000000c01")).toEqual([{ displayName: "Old Jeep" }]);
  });

  it.each([
    ["", "Enter a display name"],
    ["x".repeat(21), "Must be at most 20 characters"],
    ["Van #2", "Use only Latin letters, digits, spaces, apostrophes and hyphens"],
  ])("doesn't send the name %j", async (value, message) => {
    await openCars();

    await userEvent.click(card("AA111AA").getByRole("button", { name: "Edit AA111AA" }));
    const name = card("AA111AA").getByLabelText("Display name");
    await userEvent.clear(name);
    if (value) {
      await userEvent.type(name, value);
    }
    await userEvent.click(card("AA111AA").getByRole("button", { name: "Save" }));

    expect(name).toHaveAccessibleDescription(message);
    expect(requestsTo("PATCH /api/cars/00000000-0000-4000-8000-000000000c01")).toHaveLength(0);
  });

  it("allows editing only one car at a time", async () => {
    await openCars();

    await userEvent.click(card("AA111AA").getByRole("button", { name: "Edit AA111AA" }));

    expect(card("BB222BB").getByRole("button", { name: "Edit BB222BB" })).toBeDisabled();
    expect(card("BB222BB").getByRole("button", { name: "Delete BB222BB" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add car" })).toBeDisabled();

    await userEvent.click(card("AA111AA").getByRole("button", { name: "Cancel" }));

    expect(card("BB222BB").getByRole("button", { name: "Edit BB222BB" })).toBeEnabled();
    expect(card("AA111AA").getByRole("heading", { name: "My Jeep" })).toBeInTheDocument();
  });

  it("discards the editor when the user leaves the page and comes back", async () => {
    mockApi({ "GET /api/spaces": () => json(200, { spaces: [] }) });
    await openCars();
    await userEvent.click(card("AA111AA").getByRole("button", { name: "Edit AA111AA" }));
    await userEvent.type(card("AA111AA").getByLabelText("Display name"), " 2");
    const nav = within(screen.getByRole("navigation", { name: "Main" }));

    await userEvent.click(nav.getByRole("link", { name: "Parking Diagram" }));
    await userEvent.click(nav.getByRole("link", { name: "My Cars" }));

    expect(await screen.findByRole("listitem", { name: "AA111AA" })).toBeInTheDocument();
    expect(card("AA111AA").getByRole("heading", { name: "My Jeep" })).toBeInTheDocument();
    expect(card("AA111AA").queryByLabelText("Display name")).not.toBeInTheDocument();
  });

  it("shows an error when saving fails, and reloading shows the saved values", async () => {
    mockApi({ "PATCH /api/cars/00000000-0000-4000-8000-000000000c01": () => json(500) });
    await openCars();

    await userEvent.click(card("AA111AA").getByRole("button", { name: "Edit AA111AA" }));
    await userEvent.type(card("AA111AA").getByLabelText("Display name"), " 2");
    await userEvent.click(card("AA111AA").getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Your changes couldn't be saved. Please reload the page.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(await screen.findByRole("listitem", { name: "AA111AA" })).toBeInTheDocument();
    expect(card("AA111AA").getByRole("heading", { name: "My Jeep" })).toBeInTheDocument();
  });
});

describe("deleting a car", () => {
  it("asks for confirmation, then removes the car from the list", async () => {
    mockApi({ "DELETE /api/cars/00000000-0000-4000-8000-000000000c01": () => json(204) });
    await openCars();

    await userEvent.click(card("AA111AA").getByRole("button", { name: "Delete AA111AA" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Remove AA111AA from your cars?" }));
    await userEvent.click(dialog.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(cardNames()).toEqual(["BB222BB"]));
    expect(requestsTo("DELETE /api/cars/00000000-0000-4000-8000-000000000c01")).toHaveLength(1);
  });

  it("keeps the car when the confirmation is cancelled", async () => {
    await openCars();

    await userEvent.click(card("AA111AA").getByRole("button", { name: "Delete AA111AA" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Remove AA111AA from your cars?" }));
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(cardNames()).toEqual(["AA111AA", "BB222BB"]);
    expect(requestsTo("DELETE /api/cars/00000000-0000-4000-8000-000000000c01")).toHaveLength(0);
  });

  it("shows an error when the removal fails", async () => {
    mockApi({ "DELETE /api/cars/00000000-0000-4000-8000-000000000c01": () => json(500) });
    await openCars();

    await userEvent.click(card("AA111AA").getByRole("button", { name: "Delete AA111AA" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("Your changes couldn't be saved. Please reload the page.")).toBeInTheDocument();
  });
});
