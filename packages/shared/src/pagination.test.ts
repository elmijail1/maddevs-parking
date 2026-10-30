import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, listQuerySchema } from "./pagination";

describe("cursors", () => {
  it("encode and decode a date and an id", () => {
    const date = new Date("2026-10-30T07:20:00.123Z");
    const id = "6f1c2a3b-0000-4000-8000-0000000000aa";

    const cursor = encodeCursor(date, id);

    expect(listQuerySchema.parse({ cursor })).toEqual({ cursor });
    expect(decodeCursor(cursor)).toEqual({ date, id });
  });

  it.each(["", "abc", "2026-10-30_abc", "2026-10-30T07:20:00.123Z_not-a-uuid"])("reject %j", (cursor) => {
    expect(listQuerySchema.safeParse({ cursor }).success).toBe(false);
  });

  it("are optional", () => {
    expect(listQuerySchema.parse({})).toEqual({});
  });
});
