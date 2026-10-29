import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource, fetchMock, json, mockApi, renderApp, requestsTo, resetApi, testUser } from "./helpers";

const currentPassword = "Secret12!";
const newPassword = "Better34#";

const section = (name: "Your email" | "Your password") => within(screen.getByRole("region", { name }));
const emailForm = () => within(screen.getByRole("form", { name: "Edit email" }));
const passwordForm = () => within(screen.getByRole("form", { name: "Edit password" }));

async function openProfile() {
  const view = renderApp("/profile");
  await screen.findByRole("heading", { name: "My Profile" });
  return view;
}

async function type(form: ReturnType<typeof emailForm>, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    const input = form.getByLabelText(label);
    await userEvent.clear(input);
    await userEvent.type(input, value);
  }
}

async function openEmailEditor() {
  await userEvent.click(screen.getByRole("button", { name: "Edit email" }));
  return emailForm();
}

async function openPasswordEditor() {
  await userEvent.click(screen.getByRole("button", { name: "Edit password" }));
  return passwordForm();
}

beforeEach(() => {
  resetApi();
  mockApi({ "GET /api/spaces": () => json(200, { spaces: [] }) });
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("profile page", () => {
  it("redirects to /authenticate when the user isn't logged in", async () => {
    resetApi(null);

    const { router } = renderApp("/profile");

    await screen.findByRole("tab", { name: "Log in" });
    expect(router.state.location.pathname).toBe("/authenticate");
  });

  it("shows the email, a hidden password and the log out button", async () => {
    await openProfile();

    expect(section("Your email").getByText(testUser.email)).toBeInTheDocument();
    expect(section("Your password").getByText("••••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("has a header to switch between the diagram and the profile", async () => {
    const { router } = await openProfile();
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getByRole("link", { name: "My Profile" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(nav.getByRole("link", { name: "Parking Diagram" }));

    expect(router.state.location.pathname).toBe("/spaces");
    expect(nav.getByRole("link", { name: "Parking Diagram" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "My Profile" })).not.toHaveAttribute("aria-current");
  });
});

describe("changing the email", () => {
  it("sends the new email with the current password and shows it", async () => {
    const changed = { ...testUser, email: "new@example.com" };
    mockApi({ "PATCH /api/profile/email": () => json(200, { user: changed }) });
    await openProfile();

    const form = await openEmailEditor();
    expect(form.getByLabelText("New email")).toHaveValue(testUser.email);
    await type(form, { "New email": " New@Example.com", "Current password": currentPassword });
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Your email was changed.")).toBeInTheDocument();
    expect(section("Your email").getByText(changed.email)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Edit email" })).not.toBeInTheDocument();
    expect(requestsTo("PATCH /api/profile/email")).toEqual([{ email: changed.email, currentPassword }]);
  });

  it("shows when the email is used by someone else and keeps the editor open", async () => {
    mockApi({ "PATCH /api/profile/email": () => json(409, { error: "email_taken" }) });
    await openProfile();

    const form = await openEmailEditor();
    await type(form, { "New email": "taken@example.com", "Current password": currentPassword });
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(form.getByLabelText("New email")).toHaveAccessibleDescription("Email already in use, try another"),
    );
    expect(form.getByLabelText("New email")).toHaveValue("taken@example.com");
  });

  it("shows a wrong current password under its field", async () => {
    mockApi({ "PATCH /api/profile/email": () => json(403, { error: "wrong_password" }) });
    await openProfile();

    const form = await openEmailEditor();
    await type(form, { "New email": "new@example.com", "Current password": "Wrong123!" });
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(form.getByLabelText("Current password")).toHaveAccessibleDescription("Wrong password"));
  });

  it.each([
    ["an empty email", { "New email": " " }, { "New email": "Enter your email" }],
    ["an invalid email", { "New email": "new@" }, { "New email": "Enter a valid email" }],
    [
      "a too long email",
      { "New email": `${"a".repeat(89)}@example.com` },
      { "New email": "Email must be at most 100 characters" },
    ],
  ])("doesn't send %s or a missing current password", async (_, values, messages) => {
    await openProfile();

    const form = await openEmailEditor();
    await type(form, values);
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    for (const [label, message] of Object.entries(messages)) {
      expect(form.getByLabelText(label)).toHaveAccessibleDescription(message);
    }
    expect(form.getByLabelText("Current password")).toHaveAccessibleDescription("Enter your current password");
    expect(requestsTo("PATCH /api/profile/email")).toHaveLength(0);
  });

  it("discards the changes on Cancel", async () => {
    await openProfile();

    const form = await openEmailEditor();
    await type(form, { "New email": "new@example.com" });
    await userEvent.click(form.getByRole("button", { name: "Cancel" }));

    expect(section("Your email").getByText(testUser.email)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Edit email" })).not.toBeInTheDocument();
  });
});

describe("changing the password", () => {
  it("sends the current and the new password", async () => {
    mockApi({ "PATCH /api/profile/password": () => json(204) });
    await openProfile();

    const form = await openPasswordEditor();
    await type(form, {
      "Current password": currentPassword,
      "New password": newPassword,
      "Confirm your new password": newPassword,
    });
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Your password was changed.")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Edit password" })).not.toBeInTheDocument();
    expect(requestsTo("PATCH /api/profile/password")).toEqual([{ currentPassword, newPassword }]);
  });

  it("starts with empty fields that can each be shown", async () => {
    await openProfile();

    const form = await openPasswordEditor();

    for (const label of ["Current password", "New password", "Confirm your new password"]) {
      expect(form.getByLabelText(label)).toHaveValue("");
      expect(form.getByLabelText(label)).toHaveAttribute("type", "password");
    }
    await userEvent.click(form.getByRole("button", { name: "Show new password" }));
    expect(form.getByLabelText("New password")).toHaveAttribute("type", "text");
    expect(form.getByLabelText("Current password")).toHaveAttribute("type", "password");
  });

  it.each([
    [{ "New password": "Ab1!", "Confirm your new password": "Ab1!" }, "New password", "Password must be at least 8 characters"],
    [{ "New password": "Secret12", "Confirm your new password": "Secret12" }, "New password", "Password must include a special character"],
    [
      { "New password": "Sécret12!", "Confirm your new password": "Sécret12!" },
      "New password",
      "Use only Latin letters, digits and special characters like !@#$%",
    ],
    [{ "New password": newPassword, "Confirm your new password": "Better34?" }, "Confirm your new password", "Passwords don't match"],
  ])("doesn't send an invalid new password: %j", async (values, label, message) => {
    await openProfile();

    const form = await openPasswordEditor();
    await type(form, { "Current password": currentPassword, ...values });
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    expect(form.getByLabelText(label)).toHaveAccessibleDescription(message);
    expect(requestsTo("PATCH /api/profile/password")).toHaveLength(0);
  });
});

describe("editing", () => {
  it("allows only one editor at a time", async () => {
    await openProfile();

    await openEmailEditor();

    expect(section("Your password").getByRole("button", { name: "Edit password" })).toBeDisabled();
  });

  it("covers the page with a spinner while saving", async () => {
    mockApi({ "PATCH /api/profile/email": () => new Promise(() => {}) });
    await openProfile();

    const form = await openEmailEditor();
    await type(form, { "New email": "new@example.com", "Current password": currentPassword });
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("progressbar", { name: "Saving" })).toBeInTheDocument();
  });

  it("shows an error when saving fails, and reloading shows the values from before the edit", async () => {
    mockApi({ "PATCH /api/profile/email": () => json(500) });
    await openProfile();

    const form = await openEmailEditor();
    await type(form, { "New email": "new@example.com", "Current password": currentPassword });
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Your changes couldn't be saved. Please reload the page.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your email" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(await screen.findByRole("region", { name: "Your email" })).toBeInTheDocument();
    expect(section("Your email").getByText(testUser.email)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Edit email" })).not.toBeInTheDocument();
    expect(requestsTo("GET /api/auth/me").length).toBeGreaterThanOrEqual(2);
  });

  it("treats a request that can't reach the server as a failed save", async () => {
    mockApi({ "PATCH /api/profile/password": () => Promise.reject(new DOMException("Timed out", "TimeoutError")) });
    await openProfile();

    const form = await openPasswordEditor();
    await type(form, {
      "Current password": currentPassword,
      "New password": newPassword,
      "Confirm your new password": newPassword,
    });
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Your changes couldn't be saved. Please reload the page.")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/profile/password")!;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("discards the changes when the user leaves the page and comes back", async () => {
    await openProfile();
    const form = await openEmailEditor();
    await type(form, { "New email": "new@example.com" });
    const nav = within(screen.getByRole("navigation", { name: "Main" }));

    await userEvent.click(nav.getByRole("link", { name: "Parking Diagram" }));
    await userEvent.click(nav.getByRole("link", { name: "My Profile" }));

    expect(await screen.findByRole("region", { name: "Your email" })).toBeInTheDocument();
    expect(section("Your email").getByText(testUser.email)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Edit email" })).not.toBeInTheDocument();
  });

  it("sends the user to log in when the session ran out", async () => {
    mockApi({ "PATCH /api/profile/email": () => json(401, { error: "unauthorized" }) });
    const { router } = await openProfile();

    const form = await openEmailEditor();
    await type(form, { "New email": "new@example.com", "Current password": currentPassword });
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await screen.findByRole("tab", { name: "Log in" });
    expect(router.state.location.pathname).toBe("/authenticate");
  });
});

describe("logging out", () => {
  async function logOut() {
    mockApi({ "POST /api/auth/logout": () => json(204) });
    const view = await openProfile();
    mockApi({ "GET /api/auth/me": () => json(401, { error: "unauthorized" }) });
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await screen.findByRole("tab", { name: "Log in" });
    return view;
  }

  it("logs out and redirects to /authenticate", async () => {
    const { router } = await logOut();

    expect(router.state.location.pathname).toBe("/authenticate");
    expect(requestsTo("POST /api/auth/logout")).toHaveLength(1);
  });

  it("keeps protected pages closed after logging out", async () => {
    const { router } = await logOut();

    for (const path of ["/profile", "/spaces"]) {
      await act(() => router.navigate(path));
      await screen.findByRole("tab", { name: "Log in" });
      expect(router.state.location.pathname).toBe("/authenticate");
    }
  });

  it("takes the user to /spaces when they log back in", async () => {
    const { router } = await logOut();

    mockApi({ "POST /api/auth/login": () => json(200, { user: testUser }) });
    const login = within(screen.getByRole("form", { name: "Log in" }));
    await userEvent.type(login.getByLabelText("Email"), testUser.email);
    await userEvent.type(login.getByLabelText("Password"), currentPassword);
    await userEvent.click(login.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/spaces"));
  });
});
