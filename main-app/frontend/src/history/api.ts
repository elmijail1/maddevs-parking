import { historyResponseSchema, type HistoryResponse } from "@parking/shared";
import { sendRequest } from "../api-request";

export const historyQueryKey = ["history"];

export async function fetchHistory(cursor?: string): Promise<HistoryResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return historyResponseSchema.parse(await sendRequest("GET", `/api/history${query}`));
}
