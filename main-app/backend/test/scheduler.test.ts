import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelAllJobs, cancelJob, jobTime, scheduleJob } from "../src/services/scheduler";

const log = { error: vi.fn() } as unknown as Parameters<typeof scheduleJob>[3];

afterEach(() => {
  cancelAllJobs();
  vi.useRealTimers();
});

describe("scheduler", () => {
  it("runs a job at its time and forgets it", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => {});
    scheduleJob("job", new Date(Date.now() + 60_000), run, log);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(run).toHaveBeenCalledOnce();
    expect(jobTime("job")).toBeUndefined();
  });

  it("runs a job that is already due at once", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => {});

    scheduleJob("job", new Date(Date.now() - 1000), run, log);
    await vi.advanceTimersByTimeAsync(0);

    expect(run).toHaveBeenCalledOnce();
  });

  it("replaces a job scheduled under the same key", async () => {
    vi.useFakeTimers();
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    scheduleJob("job", new Date(Date.now() + 1000), first, log);

    scheduleJob("job", new Date(Date.now() + 5000), second, log);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("doesn't run a cancelled job", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => {});
    scheduleJob("job", new Date(Date.now() + 1000), run, log);

    cancelJob("job");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(run).not.toHaveBeenCalled();
  });

  it("logs a failing job instead of crashing", async () => {
    vi.useFakeTimers();
    scheduleJob("job", new Date(Date.now() + 1000), async () => Promise.reject(new Error("boom")), log);

    await vi.advanceTimersByTimeAsync(1000);

    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ job: "job" }), "Scheduled job failed");
  });
});
