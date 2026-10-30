import type { HistoryEntry } from "@parking/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource, json, mockApi, renderApp, requestsTo, resetApi } from "./helpers";
import { FakeIntersectionObserver } from "./setup";

const entry = (index: number, overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  parkingId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  regNumber: "AA111AA",
  carName: "My Jeep",
  spaceName: "A1",
  status: "finished",
  date: new Date(Date.UTC(2026, 9, 30, 6, 0) - index * 3_600_000).toISOString(),
  payment: { status: "paid", total: 284, paidAt: "2026-10-30T07:20:00.000Z" },
  ...overrides,
});

function serveHistory(total: number) {
  const entries = Array.from({ length: total }, (_, index) => entry(index + 1));
  for (let page = 0; page * 10 < Math.max(total, 1); page++) {
    const route = page === 0 ? "GET /api/history" : `GET /api/history?cursor=page-${page}`;
    const hasMore = (page + 1) * 10 < total;
    mockApi({
      [route]: () =>
        json(200, { parkings: entries.slice(page * 10, (page + 1) * 10), nextCursor: hasMore ? `page-${page + 1}` : null }),
    });
  }
}

const cards = () => {
  const list = screen.queryByRole("list", { name: "Your parkings" });
  return list ? within(list).getAllByRole("listitem").map((item) => within(item).getByRole("heading").textContent) : [];
};

async function openHistory(path = "/history") {
  const view = renderApp(path);
  await screen.findByRole("heading", { name: "History" });
  return view;
}

beforeEach(() => {
  resetApi();
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("history page", () => {
  it("redirects to /authenticate when the user isn't logged in", async () => {
    resetApi(null);

    const { router } = renderApp("/history");

    await screen.findByRole("tab", { name: "Log in" });
    expect(router.state.location.pathname).toBe("/authenticate");
  });

  it("is linked from the header", async () => {
    serveHistory(0);
    mockApi({ "GET /api/spaces": () => json(200, { spaces: [] }) });
    const { router } = renderApp("/spaces");

    await userEvent.click(await screen.findByRole("link", { name: "History" }));

    expect(router.state.location.pathname).toBe("/history");
  });

  it("shows each card's car, number, space, date, status and payment", async () => {
    mockApi({
      "GET /api/history": () =>
        json(200, {
          nextCursor: null,
          parkings: [
            entry(1, { status: "active", payment: null, date: "2026-10-30T06:12:00.000Z" }),
            entry(2, { status: "booked", payment: null, carName: "Work van", regNumber: "BB222BB", spaceName: "B2" }),
            entry(3, { status: "cancelled", payment: null }),
            entry(4, { payment: { status: "unpaid" } }),
            entry(5, { date: "2026-10-30T06:00:00.000Z" }),
          ],
        }),
    });
    await openHistory();
    await screen.findByRole("list", { name: "Your parkings" });

    const items = within(screen.getByRole("list", { name: "Your parkings" }))
      .getAllByRole("listitem")
      .map((item) => within(item));
    expect(items[0]!.getByText("In the lot")).toBeInTheDocument();
    expect(items[0]!.getByText("Entered 30 Oct 2026, 10:12")).toBeInTheDocument();
    expect(items[0]!.queryByText(/Paid/)).not.toBeInTheDocument();
    expect(items[1]!.getByRole("heading", { name: "Work van" })).toBeInTheDocument();
    expect(items[1]!.getByText("BB222BB · Space B2")).toBeInTheDocument();
    expect(items[1]!.getByText("Booked")).toBeInTheDocument();
    expect(items[1]!.getByText(/^Booked \d/)).toBeInTheDocument();
    expect(items[2]!.getByText("Cancelled")).toBeInTheDocument();
    expect(items[3]!.getByText("Left without paying")).toBeInTheDocument();
    expect(items[4]!.getByText("Finished")).toBeInTheDocument();
    expect(items[4]!.getByText("Entered 30 Oct 2026, 10:00")).toBeInTheDocument();
    expect(items[4]!.getByText("Paid: $2.84 on 30 Oct 2026, 11:20")).toBeInTheDocument();
  });

  it("shows the first 10 parkings, without loading more or an end message", async () => {
    serveHistory(10);

    await openHistory();

    await waitFor(() => expect(cards()).toHaveLength(10));
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(screen.queryByText("That's all your parkings.")).not.toBeInTheDocument();
    FakeIntersectionObserver.scrollToEnd();
    expect(requestsTo("GET /api/history")).toHaveLength(1);
  });

  it("loads 10 more when the user scrolls to the end, until all are shown", async () => {
    serveHistory(23);
    await openHistory();
    await waitFor(() => expect(cards()).toHaveLength(10));

    FakeIntersectionObserver.scrollToEnd();
    await waitFor(() => expect(cards()).toHaveLength(20));
    FakeIntersectionObserver.scrollToEnd();
    await waitFor(() => expect(cards()).toHaveLength(23));

    expect(screen.getByText("That's all your parkings.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(cards()[22]).toBe("My Jeep");
    expect(requestsTo("GET /api/history?cursor=page-1")).toHaveLength(1);
    expect(requestsTo("GET /api/history?cursor=page-2")).toHaveLength(1);
  });

  it("loads more with the Load more button too", async () => {
    serveHistory(13);
    await openHistory();
    await waitFor(() => expect(cards()).toHaveLength(10));

    await userEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => expect(cards()).toHaveLength(13));
  });

  it("offers to try again when loading more fails", async () => {
    serveHistory(13);
    mockApi({ "GET /api/history?cursor=page-1": () => json(500) });
    await openHistory();
    await waitFor(() => expect(cards()).toHaveLength(10));

    FakeIntersectionObserver.scrollToEnd();
    expect(await screen.findByText("Couldn't load more.")).toBeInTheDocument();
    expect(cards()).toHaveLength(10);

    serveHistory(13);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(cards()).toHaveLength(13));
  });

  it("keeps the title at the top while scrolling", async () => {
    serveHistory(3);

    await openHistory();

    const title = screen.getByTestId("sticky-title");
    expect(title).toHaveClass("sticky");
    expect(within(title).getByRole("heading", { name: "History" })).toBeInTheDocument();
  });

  it("says so when there are no parkings yet", async () => {
    serveHistory(0);

    await openHistory();

    expect(await screen.findByText("No parkings yet.")).toBeInTheDocument();
  });

  it("shows an error with a retry button when the history can't be loaded", async () => {
    mockApi({ "GET /api/history": () => json(500) });
    await openHistory();

    expect(await screen.findByText("An error occurred when loading your history.")).toBeInTheDocument();
    serveHistory(2);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(cards()).toHaveLength(2));
  });
});
