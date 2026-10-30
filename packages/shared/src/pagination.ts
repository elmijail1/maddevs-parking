import { z } from "zod";

export const listPageSize = 10;

const cursorPattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([0-9a-f-]{36})$/;

export function encodeCursor(date: Date, id: string) {
  return `${date.toISOString()}_${id}`;
}

export function decodeCursor(cursor: string) {
  const [, date, id] = cursorPattern.exec(cursor)!;
  return { date: new Date(date!), id: id! };
}

export const listQuerySchema = z.object({
  cursor: z.string().regex(cursorPattern).optional(),
});
