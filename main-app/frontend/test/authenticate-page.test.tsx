import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource, json, mockApi, renderApp, requestsTo, resetApi, testUser } from "./helpers";

const validPassword = "Secret12!";

function form(name: "Log in" | "Sign up") {
  return within(screen.getByRole("form", { name }));
}

async function fillIn(name: "Log in" | "Sign up", values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    await userEvent.type(form(name).getByLabelText(label), value);
  }
}

async function submit(name: "Log in" | "Sign up") {
  await userEvent.click(form(name).getByRole("button", { name }));
}

async function openAuthenticatePage(path = "/authenticate") {
  const view = renderApp(path);
  await screen.findByRole("tab", { name: "Log in" });
  return view;
}

async function switchToSignup() {
  await userEvent.click(screen.getByRole("tab", { name: "Sign up" }));
  await screen.findByRole("form", { name: "Sign up" });
}

beforeEach(() => {
  resetApi(null);
  mockApi({ "GET /api/spaces": () => json(200, { spaces: [] }) });
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("route protection", () => {
  it("redirects /spaces to /authenticate when the user isn't logged in", async () => {
    const { router } = await openAuthenticatePage("/spaces");

    expect(router.state.location.pathname).toBe("/authenticate");
    expect(requestsTo("GET /api/spaces")).toHaveLength(0);
  });

  it("redirects / to /authenticate when the user isn't logged in", async () => {
    const { router } = await openAuthenticatePage("/");

    expect(router.state.location.pathname).toBe("/authenticate");
  });

  it("redirects /authenticate to /spaces when the user is already logged in", async () => {
    resetApi(testUser);
    mockApi({ "GET /api/spaces": () => json(200, { spaces: [] }) });

    const { router } = renderApp("/authenticate");

    await waitFor(() => expect(router.state.location.pathname).toBe("/spaces"));
    expect(screen.queryByRole("tab", { name: "Log in" })).not.toBeInTheDocument();
  });

  it("shows a retry button when the session can't be checked", async () => {
    mockApi({ "GET /api/auth/me": () => json(500) });
    renderApp("/spaces");

    expect(await screen.findByText("An error occurred when checking your session.")).toBeInTheDocument();

    mockApi({ "GET /api/auth/me": () => json(401, { error: "unauthorized" }) });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("tab", { name: "Log in" })).toBeInTheDocument();
  });
});

describe("logging in", () => {
  it("logs the user in and takes them to /spaces", async () => {
    mockApi({ "POST /api/auth/login": () => json(200, { user: testUser }) });
    const { router } = await openAuthenticatePage();

    await fillIn("Log in", { Email: " Driver@Example.com", Password: validPassword });
    await submit("Log in");

    await waitFor(() => expect(router.state.location.pathname).toBe("/spaces"));
    expect(requestsTo("POST /api/auth/login")).toEqual([{ email: "driver@example.com", password: validPassword }]);
  });

  it("takes the user back to the page they originally opened", async () => {
    mockApi({ "POST /api/auth/login": () => json(200, { user: testUser }) });
    const { router } = await openAuthenticatePage("/spaces");

    await fillIn("Log in", { Email: testUser.email, Password: validPassword });
    await submit("Log in");

    await waitFor(() => expect(router.state.location.pathname).toBe("/spaces"));
  });

  it("shows an error for wrong credentials and stays on the page", async () => {
    mockApi({ "POST /api/auth/login": () => json(401, { error: "invalid_credentials" }) });
    const { router } = await openAuthenticatePage();

    await fillIn("Log in", { Email: testUser.email, Password: "Wrong123!" });
    await submit("Log in");

    expect(await screen.findByText("Wrong email or password.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/authenticate");
  });

  it("shows a general error when the server fails", async () => {
    mockApi({ "POST /api/auth/login": () => json(500) });
    await openAuthenticatePage();

    await fillIn("Log in", { Email: testUser.email, Password: validPassword });
    await submit("Log in");

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });

  it.each([
    [{}, { Email: "Enter your email", Password: "Enter your password" }],
    [{ Email: "driver@", Password: "short" }, { Email: "Enter a valid email", Password: "Password must be at least 8 characters" }],
  ])("doesn't send invalid input: %j", async (values, messages) => {
    await openAuthenticatePage();

    await fillIn("Log in", values);
    await submit("Log in");

    for (const [label, message] of Object.entries(messages)) {
      expect(form("Log in").getByLabelText(label)).toHaveAccessibleDescription(message);
    }
    expect(requestsTo("POST /api/auth/login")).toHaveLength(0);
  });

  it("shows and hides the password", async () => {
    await openAuthenticatePage();
    await fillIn("Log in", { Password: validPassword });
    const password = form("Log in").getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");

    await userEvent.click(form("Log in").getByRole("button", { name: "Show password" }));

    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue(validPassword);
    expect(form("Log in").getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(form("Log in").getByRole("button", { name: "Hide password" }));

    expect(password).toHaveAttribute("type", "password");
  });

  it("clears a field's error once it's edited", async () => {
    await openAuthenticatePage();
    await submit("Log in");
    expect(form("Log in").getByLabelText("Email")).toHaveAccessibleDescription("Enter your email");

    await fillIn("Log in", { Email: "d" });

    expect(form("Log in").getByLabelText("Email")).toHaveAttribute("aria-invalid", "false");
  });
});

describe("signing up", () => {
  it("switches between the forms with tabs, starting from an empty form", async () => {
    await openAuthenticatePage();
    await fillIn("Log in", { Email: "driver@example.com" });
    expect(form("Log in").queryByLabelText("Confirm your password")).not.toBeInTheDocument();

    await switchToSignup();

    expect(form("Sign up").getByLabelText("Confirm your password")).toBeInTheDocument();
    expect(form("Sign up").getByLabelText("Email")).toHaveValue("");
  });

  it("shows and hides each password field separately", async () => {
    await openAuthenticatePage();
    await switchToSignup();
    const password = form("Sign up").getByLabelText("Password");
    const confirmation = form("Sign up").getByLabelText("Confirm your password");

    await userEvent.click(form("Sign up").getByRole("button", { name: "Show password confirmation" }));

    expect(confirmation).toHaveAttribute("type", "text");
    expect(password).toHaveAttribute("type", "password");

    await userEvent.click(form("Sign up").getByRole("button", { name: "Show password" }));

    expect(password).toHaveAttribute("type", "text");
    expect(confirmation).toHaveAttribute("type", "text");
  });

  it("hides the passwords again after switching tabs", async () => {
    await openAuthenticatePage();
    await userEvent.click(form("Log in").getByRole("button", { name: "Show password" }));

    await switchToSignup();
    await userEvent.click(screen.getByRole("tab", { name: "Log in" }));

    expect(await screen.findByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("creates an account and takes the user to /spaces", async () => {
    mockApi({ "POST /api/auth/signup": () => json(201, { user: testUser }) });
    const { router } = await openAuthenticatePage();
    await switchToSignup();

    await fillIn("Sign up", { Email: testUser.email, Password: validPassword, "Confirm your password": validPassword });
    await submit("Sign up");

    await waitFor(() => expect(router.state.location.pathname).toBe("/spaces"));
    expect(requestsTo("POST /api/auth/signup")).toEqual([{ email: testUser.email, password: validPassword }]);
  });

  it("shows when the email is already in use", async () => {
    mockApi({ "POST /api/auth/signup": () => json(409, { error: "email_taken" }) });
    await openAuthenticatePage();
    await switchToSignup();

    await fillIn("Sign up", { Email: testUser.email, Password: validPassword, "Confirm your password": validPassword });
    await submit("Sign up");

    await waitFor(() =>
      expect(form("Sign up").getByLabelText("Email")).toHaveAccessibleDescription("This email is already in use"),
    );
  });

  it("doesn't send an empty form", async () => {
    await openAuthenticatePage();
    await switchToSignup();

    await submit("Sign up");

    expect(form("Sign up").getByLabelText("Email")).toHaveAccessibleDescription("Enter your email");
    expect(form("Sign up").getByLabelText("Password")).toHaveAccessibleDescription("Enter a password");
    expect(form("Sign up").getByLabelText("Confirm your password")).toHaveAccessibleDescription("Confirm your password");
    expect(requestsTo("POST /api/auth/signup")).toHaveLength(0);
  });

  it.each([
    ["a short password", { Password: "Ab1!" }, { Password: "Password must be at least 8 characters" }],
    ["a password without a digit", { Password: "Secret!!" }, { Password: "Password must include a digit" }],
    ["a password without a letter", { Password: "1234567!" }, { Password: "Password must include a Latin letter" }],
    ["a password without a special character", { Password: "Secret12" }, { Password: "Password must include a special character" }],
    [
      "a password with a non-Latin letter",
      { Password: "Sécret12!" },
      { Password: "Use only Latin letters, digits and special characters like !@#$%" },
    ],
    [
      "different passwords",
      { Password: validPassword, "Confirm your password": "Secret12?" },
      { "Confirm your password": "Passwords don't match" },
    ],
  ])("doesn't send %s", async (_, values, messages) => {
    await openAuthenticatePage();
    await switchToSignup();

    await fillIn("Sign up", { Email: testUser.email, ...values });
    await submit("Sign up");

    for (const [label, message] of Object.entries(messages)) {
      expect(form("Sign up").getByLabelText(label)).toHaveAccessibleDescription(message);
    }
    expect(requestsTo("POST /api/auth/signup")).toHaveLength(0);
  });
});
